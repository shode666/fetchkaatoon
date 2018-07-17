const LOG = {
  notify:(...message)=>{
    console.log('\x1b[36m','[NOTIFY]',new Date(),':',...message,'\x1b[0m')
  },
  debug:(...message)=>{
    console.log('\x1b[32m','[DEBUG] ',new Date(),':',...message,'\x1b[0m')
  },
  warn:(...message)=>{
    console.log('\x1b[33m','[WARN]   ',new Date(),':',...message,'\x1b[0m')
  },
  error:(...message)=>{
    console.log('\x1b[31m','[ERROR] ',new Date(),':',...message,'\x1b[0m')
  }
}
export default LOG ;