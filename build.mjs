// build.js
import path from 'path'
import fs from 'fs'

/** 1. 设置存储构建的json文件位置 */
const historyPath = path.resolve('history.json')
/** 2. 如果json文不存在就创建一个，初始值为 { list: [] } */
if(!fs.existsSync(historyPath)) {
  fs.writeFileSync(historyPath, JSON.stringify({ list: [] }))
}

/** 3. 读取打包后的dist/index.html内容 */
const html = fs.readFileSync(path.resolve('./dist/index.html'), 'utf-8')
/** 4. 获取到当前histyory.json的内容 */
const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
/** 5. 将当前打包的内容push到list中 */
history.list.push({
  time: new Date().toLocaleString('zh-cn'),
  html,
  // 模拟生成一个随机的id
  id: Math.random().toString(16).substr(2),
  // ... 分支信息，commit信息，构建时间，构建人，构建环境等字段
})

/** 6. 将最新的内容写入到history.json中 */
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))