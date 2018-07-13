
const notify = (...message)=>{
  console.log('\x1b[36m','[NOTIFY]',new Date(),':',...message)
}
const debug = (...message)=>{
  console.log('\x1b[32m','[DEBUG] ',new Date(),':',...message)
}
const warn = (...message)=>{
  console.log('\x1b[33m','[WARN]   ',new Date(),':',...message)
}
const error = (...message)=>{
  console.log('\x1b[31m','[ERROR] ',new Date(),':',...message)
}
module.exports = { debug, warn, error, notify}