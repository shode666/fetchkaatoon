import request from 'request-promise-native'
import { JSDOM } from 'jsdom'
import fs from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import _ from 'lodash'
import PromisePool from 'es6-promise-pool'
import log from './log'

const fileName = 'db/mangakrub.txt'
const CHAPTER_FETCH_CONCURENT_LIMIT = 4

const cleanEmptyFoldersRecursively = folder => {
  var isDir = fs.statSync(folder).isDirectory()
  if (!isDir) {
    return
  }
  var files = fs.readdirSync(folder)
  if (files.length > 0) {
    files.forEach(function(file) {
      var fullPath = path.join(folder, file)
      cleanEmptyFoldersRecursively(fullPath)
    })

    // re-evaluate files; after deleting subfolder
    // we may have parent folder empty now
    files = fs.readdirSync(folder)
  }

  if (files.length == 0) {
    fs.rmdirSync(folder)
    return
  }
}
if (!fs.existsSync('mangakrub')) fs.mkdirSync('mangakrub')
else cleanEmptyFoldersRecursively('mangakrub')
if (!fs.existsSync('db')) fs.mkdirSync('db')
const main = async () => {
  log.debug('start process')
  const listOfCartoon = await getCartoonList()
  if (listOfCartoon) {
    let allChapter = []
    for (const cartoon of listOfCartoon) {
      if (!cartoon) continue
      const [name, link] = cartoon.split('|')
      const chapters = await downloadCartoon(name, link)
      if (chapters.length > 0) {
        log.debug('Donwload Enqueue', name, chapters.length, 'chapter(s)')
        allChapter = _.concat(allChapter, chapters)
      }
    }
    allChapter = _.orderBy(allChapter, 'title')
    log.notify('Number of chapters to download', allChapter.length)
    try {
      await new PromisePool(() => {
        log.notify('Remaining.....................', allChapter.length)
        return new Promise(async (resolve, reject) => {
          if (allChapter.length == 0) return false
          const cartoon = allChapter.pop()
          if (!cartoon) {
            log.debug('empty chapter return', cartoon)
            resolve(true)
          }
          try {
          const { title, filePath, link } = cartoon
          fs.mkdirSync(filePath)
          log.debug('Extranct on chapter', title)
            const body = await request(link)
            if (body) {
              const { document } = new JSDOM(body).window
              const list = Array.from(document.querySelectorAll('div.img-wrapper img.branwdo'))
              const promistList = []
              for (const img of list) {
                if (img) {
                  const pageName = img.alt.trim()
                  const link = img.dataset.src.trim()
                  log.debug('Start download', title, pageName, link)
                  const downloadFile = fs.createWriteStream(`${filePath.trim()}/${pageName}.jpg`)
                  promistList.push(
                    new Promise(resolve => {
                      try {
                        let protocol,altProtocol;
                        if (link.match(/^https/)) {
                          protocol = https
                          altProtocol = http;
                        } else {
                          protocol = http
                          altProtocol = https;
                        }
                        const request = protocol.get(link, function(response) {
                          response.pipe(downloadFile)
                          log.notify('Download complete', title, pageName, `${filePath}/${pageName}.jpg`)
                          resolve(true)
                        })
                        request.on('error', err => {
                          log.error('Download fail', title, pageName, link, err)
                          resolve(true)
                        })
                      } catch (err) {
                        log.error('Download fail', title, pageName, link, err)
                        resolve(true)
                      }
                    })
                  )
                }else{
                  resove(true)
                }
              }
              try {
                if (promistList.length > 0) {
                  log.debug('Chapter Done', title)
                  Promise.all(promistList).then(values => {
                    resolve(true)
                  }).catch(err=>{
                    log.debug('Chapter Empty', title)
                    resolve(true)
                  })
                } else {
                  log.debug('Chapter Empty', title)
                  resolve(true)
                }
              } catch (err) {
                log.error(err)
                resolve(true)
              }
            }else{
              log.warn('Nobody Nobody but you',title)
              resolve(true)
            }
          } catch (err) {
            log.error(err)
            resolve(true)
          }
        })
      }, CHAPTER_FETCH_CONCURENT_LIMIT).start()
      log.debug('All promises fulfilled')
    } catch (error) {
      log.debug('Some promise rejected: ' + error.message)
    }
  }
}
const getCartoonList = () =>
  new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(fileName)) {
        fetchCartoonList().then(lines => resolve(lines))
      } else {
        let stream = fs.createReadStream(fileName, {
          flags: 'r',
          encoding: 'utf-8',
          fd: null,
          mode: 438, // 0666 in Octal
          bufferSize: 64 * 1024
        })
        let data = ''
        stream.on('data', moreData => {
          data += moreData
          let lines = data.split('\n')
          log.debug('get file length', lines.length)
          if (lines.length > 0) {
            stream.destroy()
            const dateMark = parseInt(lines[0])
            const yesterday = new Date().getTime() - 8.64e7
            if (!isNaN(dateMark) && dateMark < yesterday) {
              fetchCartoonList().then(L => resolve(L))
            } else {
              resolve(lines.splice(1))
            }
          }
        })
      }
    } catch (e) {
      reject(e)
    }
  })
const fetchCartoonList = () =>
  new Promise((resolve, reject) => {
    let lines = []
    request('https://www.mangakrub.com/manga/list', (error, response, body) => {
      try {
        if (body) {
          const { document } = new JSDOM(body).window
          const list = document.querySelectorAll('a.list-group-item')
          var logger = fs.createWriteStream(fileName, {
            flags: 'w'
          })
          logger.write(`${new Date().getTime()}\n`)
          for (const a of list) {
            const title = a
              .querySelector('h4.list-group-item-heading')
              .textContent.replace(/\//g, '_')
              .trim()
            const link = a.href.trim()

            if (title && link) lines.push(title + '|' + link)
            logger.write(title + '|' + link + '\n')
          }
          logger.end()
          resolve(lines)
        } else {
          log.error(error)
          reject(error)
        }
      } catch (e) {
        reject(e)
      }
    })
  })
const downloadCartoon = (name, link) =>
  new Promise((resolve, reject) => {
    if (!name || !link) return
    if (!fs.existsSync(`mangakrub/${name}`)) {
      fs.mkdirSync(`mangakrub/${name}`)
    }
    request(link, (error, response, body) => {
      const chapters = []
      try {
        if (body) {
          const { document } = new JSDOM(body).window
          const list = document.querySelectorAll('a.list-group-item')
          for (const a of list) {
            const title = a
              .querySelector('span')
              .textContent.replace(/\//g, '_')
              .trim()
            const link = a.href.trim()
            const filePath = `mangakrub/${name}/${title}`
            if (!fs.existsSync(filePath) && !!link) {
              chapters.push({ title, filePath, link })
            }
          }
        }
      } catch (error) {
        log.error(error)
      }
      resolve(chapters)
    })
  })
main()
