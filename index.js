const request = require('request')
const { JSDOM } = require('jsdom')
const fs = require('fs')
const _ = require('lodash')
const download = require('download-file')
const unzip = require('unzip')
const PromisePool = require('es6-promise-pool')
const rimraf = require('rimraf')

const fileName = 'db/cartoons.txt'
if (!fs.existsSync('manga')) {
  fs.mkdirSync('manga')
}
if (!fs.existsSync('db')) {
  fs.mkdirSync('db')
}
const main = () => {
  console.log('start process')
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
                console.log('resove chapters')
                resolve(all)
              }
            })
          }
        }
      })
    })
    .then(allChapter => {
      var pool = new PromisePool(() => {
        const cartoon = allChapter.pop()
        if (!cartoon) return false
        const { title, filePath, link } = cartoon
        console.log(new Date(), 'Start Download', title,link)
        return new Promise((resolve, reject) => {
          fs.mkdirSync(filePath)
          download(
            link,
            {
              directory: filePath,
              filename: 'source.zip'
            },
            function(err) {
              if (err) {
                console.log(`download problem ${link}`, err)
                resolve(`download problem ${link}`, err)
                // rimraf.sync(filePath)
                // console.log(`delete file ${filePath}`)
              }else{
                console.log(`download complete ${link}`)
                fs.createReadStream(`${filePath}/source.zip`)
                  .pipe(unzip.Extract({ path: filePath }))
                  .on('finish', () => {
                    try{
                      setTimeout(()=>{
                        fs.unlinkSync(`${filePath}/source.zip`)
                        console.log('unzip file complete delete', `${filePath}/source.zip`)
                      },20000)
                    }catch(e){}
                    resolve('unzip file complete delete', `${filePath}/source.zip`)
                  })
              }
            }
          )
        })
      }, 2)

      var poolPromise = pool.start()

      // Wait for the pool to settle.
      poolPromise.then(
        function() {
          console.log('All promises fulfilled')
        },
        function(error) {
          console.log('Some promise rejected: ' + error.message)
        }
      )
    })
    .catch(e => {
      console.error(e)
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
          console.log('geta file length', lines.length)
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
    request('https://mangazuki.co/changeMangaList?type=text', (error, response, body) => {
      try {
        if (body) {
          const { document } = new JSDOM(body).window
          const list = document.querySelectorAll('li.list-rtl')
          var logger = fs.createWriteStream(fileName, {
            flags: 'w'
          })
          logger.write(`${new Date().getTime()}\n`)
          for (const li of list) {
            const title = li.querySelector('h6').textContent
            const link = li.querySelector('a').href

            if (title && link) lines.push(title + '|' + link)
            logger.write(title + '|' + link + '\n')
          }
          logger.end()
          resolve(lines)
        } else {
          console.error(error)
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
    if (!fs.existsSync(`manga/${name}`)) {
      fs.mkdirSync(`manga/${name}`)
    }
    request(link, (error, response, body) => {
      const chapters = []
      try {
        if (body) {
          const { document } = new JSDOM(body).window
          const list = document.querySelectorAll('ul.chapters li')
          for (const li of list) {
            const title = li.querySelector('.chapter-title-rtl').textContent.trim()
            const link = li.querySelector('a[title=download]').href
            const filePath = `manga/${name}/${title}`
            if (!fs.existsSync(filePath)) {
              chapters.push({ title, filePath, link })
            }
          }
        }
      } catch (error) {
        console.error(error)
      }
      resolve(chapters)
    })
  })
main()
