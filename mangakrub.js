const request = require('request')
const { JSDOM } = require('jsdom')
const fs = require('fs')
const _ = require('lodash')
const download = require('download-file')
const PromisePool = require('es6-promise-pool')
const log = require('./log')

const fileName = 'db/mangakrub.txt'
if (!fs.existsSync('mangakrub')) {
  fs.mkdirSync('mangakrub')
}
if (!fs.existsSync('db')) {
  fs.mkdirSync('db')
}
const main = () => {
  log.debug('start process')
  getCartoonList()
    .then(listOfCartoon => {
      return new Promise((resolve, reject) => {
        let all = []
        const size = listOfCartoon.length - 1
        let couter = 0
        if (listOfCartoon) {
          for (cartoon of listOfCartoon) {
            const [name, link] = cartoon.split('|')
            downloadCartoon(name, link).then(chapters => {
              all = _.concat(all, chapters)
              if (++couter === size) {
                log.debug('resove chapters')
                resolve(all)
              }
            })
          }
        }
      })
    })
    .then(allChapter => {
      var pool = new PromisePool(() => {
        if(allChapter.length==0)return;
        log.notify('Remaining.....................',allChapter.length)
        const cartoon = allChapter.pop()
        if (!cartoon) {
          log.debug('empty chapter return',cartoon)
          return new Promise(r=>r(true))
        }
        const { title, filePath, link } = cartoon
        fs.mkdirSync(filePath)
        log.debug('Extranct on chapter',title);
        return new Promise((resolve, rejext) => {
          request(link, (error, response, body) => {
            const chapters = []
            try {
              if (body) {
                const { document } = new JSDOM(body).window
                const list = Array.from(document.querySelectorAll('div.img-wrapper img.branwdo'));
                var pagesPool = new PromisePool(() => {
                  if(list.length==0)return;
                  const img = list.pop();
                  if(!img) {
                    log.debug('empty image',img)
                    return new Promise(r=>r(true));
                  }
                  return new Promise((resolve,reject)=>{
                    if(!img) {
                      resolve(true)
                    }
                    const title = img.alt
                    const link = img.dataset.src
                    log.debug('Start download',title,link)
                    download(
                      link,
                      {
                        directory: filePath,
                        filename: `${title}.jpg`
                      },
                      err => {
                        if (err) {
                          log.error('Download fail',link, err);
                        }else {
                          log.notify('Download complete',title,link);
                        }
                        resolve(true);
                      }
                    )
                  })
                },4);
                var pagesPoolPromise = pagesPool.start()

                pagesPoolPromise.then(
                  function() {
                    log.debug('All promises fulfilled')
                    resolve(true)
                  },
                  function(error) {
                    log.debug('Some promise rejected: ' + error.message)
                    resolve(true)
                  }
                )
              }
            } catch (error) {
              log.error(error)
            }
          })
        })
      }, 2)

      var poolPromise = pool.start()

      // Wait for the pool to settle.
      poolPromise.then(
        function() {
          log.debug('All promises fulfilled')
        },
        function(error) {
          log.debug('Some promise rejected: ' + error.message)
        }
      )
    })
    .catch(e => {
      log.error(e)
    })
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
          log.debug('geta file length', lines.length)
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
            const title = a.querySelector('h4.list-group-item-heading').textContent.replace(/\//g, '_')
            const link = a.href

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
            const title = a.querySelector('span').textContent.replace(/\//g, '_')
            const link = a.href
            const filePath = `mangakrub/${name}/${title}`
            if (!fs.existsSync(filePath)) {
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
