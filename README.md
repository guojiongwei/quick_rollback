# 【前端工程化】未使用docker时，前端项目怎么实现线上秒级回滚？

## 一. 前言

本文是专栏[《前端工程化》](https://juejin.cn/column/7092293219064479752 "https://juejin.cn/column/7092293219064479752")第12篇文章，会持续更新前端工程化方面详细高质量的教程。

项目**快速回滚**是**前端工程化**中很重要的一环，项目部署到线上后如果报错打不开或者其他原因需要回滚到上一个版本，这个时候回滚的速度就会显得尤为重要。

正常的回滚步骤：需要**git reset**回退代码或者**git rervet**撤销上个版本的代码，然后重新打包上线，撤回代码和重新打包都需要时间，会影响线上**几分钟**的时间，需要一种更快的方案来实现**秒级回滚**。

**docker**是一个很好的实现方案，但不是所有公司都会用**docker**来部署前端应用，大部分都是通过**nginx**在本地托管，或者上传到**oss**上面通过**cdn**的方式来访问静态资源。

本文将带你一步一步实现一个前端项目秒级回滚的**demo**，适合跟着文章手动敲一遍，可以更好的理解整体流程的实现，快速应用到自己公司项目里面。

> 本文示例完整代码已上传：<https://github.com/guojiongwei/quick_rollback.git>

## 二. 思路

单页应用打包后都有一个**index.html**入口文件，每一次打包后的**index.html**里面都会引入本版本所需要的静态资源，如果我们能不删除过往版本的静态资源(或者上传到**oss**上面)，并且每次项目打包都把本次打包的信息和**index.html**内容保存起来，保存一个数组列表数据。

在需要回滚版本时，通过前端可视化界面可以选择项目中某个分支中的构建记录进行快速回滚。具体实现原理就是用回滚版本存的**index.html**内容替换当前项目正在使用的**index.html**内容，替换**index.html**内容后，引入的静态资源都会变成该版本打包出来的静态资源路径，从而实现快速回滚。

静态资源一般可以放到**oss**上面，也方便**cdn**加速，本文为了演示功能，把每一次打包出来的静态资源都放到了项目本地的**dist**里面，重新构建不会删除原有的资源。

> 这种方案适用于所有的单页应用项目，不限制react还是vue，webpack还是vite，整体思路就是保留历史构建的css，js，图片等静态资源，保存每一次构建的index.html内容，回滚时用对应版本的index.html内容替换当前的内容，实现真正的秒级回滚。

## 三. 实践

### 3.1 准备单页应用项目

先准备一个单页应用项目，以**react** + **vite**为例，在命令行执行命令创建项目:

```bash
# npm 6.x
npm create vite@latest quick_rollback --template react-ts

# npm 7+, 需要加双--
npm create vite@latest quick_rollback -- --template react-ts
```

项目创建好，进入到项目里面安装依赖：

```bash
cd quick_rollback
npm install
```

**vite**默认在构建的时候会把原先的**dist**文件夹删除调，需要修改一下配置，让**vite**在构建的时候不删除原先的**dist**文件，这样**dist**里面就会保留每次构建的静态资源了(**webpack**也有类似的配置)。

修改**vite.config.ts**配置，添加**build**配置：

```ts
build: {
  emptyOutDir: false, // 每次打包后不删除输出目录
}
```

> 注意：真实的项目一般都会把前端静态资源上传到**oss**上面，采用**cdn**访问的方式，就不需要配置该项，该项主要是方便本文的**demo**演示才配置的。
> 
> 如果公司前端项目静态资源没有上传到**oss**上面，而是最基础的放在当前服务器的项目**dist**文件里面，用**nginx**托管了一下，也还是需要配置这一项，只有保留了历史构建资源才能更好的实现秒级回滚。

来测试一下，先执行第一次打包：

```bash
npm run build
```

在项目中生成了**dist**文件夹

![1.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e2c9c237a1fe423a87dabb5b87743fa6~tplv-k3u1fbpfcp-watermark.image?)

修改一下**src/App.tsx**里面的代码，替换：

```tsx
<h1>Vite + React</h1>

// 替换为

<h1>Vite + React + 秒级回滚</h1>
```

替换完成后，再次执行**npm run build**进行打包。

![2.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/eedc3afafa9c4b6f9c89d6d1aaaee5e8~tplv-k3u1fbpfcp-watermark.image?)

可以看到重新打包时没有清空**dist**文件夹，保留了上一次构建的**index.js**。

接下来要做的就是每次构建成功后，都记录下本次**index.html**的值，保存起来，等待回滚的时候使用进行替换。

### 3.2 保存历史构建index.html内容

在项目根目录新增脚本文件**build.mjs**（使用.mjs是为了方便使用**ES Module**语法），添加代码：

```js
// build.mjs

console.log('打包记录历史构建index.html内容')
```

并且在**npm run build**后执行该文件，修改**package.json**：

```json
"build": "tsc && vite build && node build.mjs",
```

现在每次打包都会执行**node build.mjs**文件了，下面就要获取打包后的**index.html**内容并且保存下来了。

保存的构建记录内容需要存起来，可以存在数据库里面，本文为了简单模拟就存在了项目根目录的**history.json**文件里面了。

修改**build.jms**:

```js
// build.js
import path from 'path'
import fs from 'fs'

function start() {
  // 设置存储构建的history.json文件路径
  const historyPath = path.resolve('history.json')
  // 如果json文不存在就创建一个，初始值为 { list: [] }
  if(!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, JSON.stringify({ list: [] }))
  }
  // 读取本次打包后的dist/index.html内容
  const html = fs.readFileSync(path.resolve('./dist/index.html'), 'utf-8')
  // 获取到当前histyory.json的内容
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
  // 将当前打包的信息push到history的list中，包含构建时间和index.html内容还有id
  // 实际应用中还可以添加其他的很多信息
  history.list.push({
    time: new Date().toLocaleString('zh-cn'),
    html,
    // 模拟生成一个随机的id
    id: Math.random().toString(16).substr(2),
    // ... 分支信息，commit信息，构建时间，构建人，构建环境等字段
  })

  // 将最新的构建记录内容写入到history.json中
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
}

start()
```

具体逻辑：

1.  先设置了一下存储构建的**history.json**文件路径。
2.  如果json文不存在就创建一个，初始值为 **{ list: \[] }**。
3.  读取本次打包后的**dist/index.html**内容。
4.  获取一下当前的**history.json**文件内容。
5.  将当前打包的信息**push**到**list**中，包含构建时间和**index.html**内容还有**id**（以及其他信息）。
6.  把最新的构建记录数据写入到**history.json**文件中。

修改完成后先执行一次打包：

```bash
npm run build
```

然后修改**src/App.tsx**，把刚才的改动改回来：

```tsx
<h1>Vite + React + 秒级回滚</h1>

// 替换为

<h1>Vite + React</h1>
```

替换完成后再打包一次：

```bash
npm run build
```

打包完成后再查看**history.json**文件，会看到里面保留了两次构建的**index.html**信息。

![3.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f2dbd410056f483a81c2ce21af7eeb9d~tplv-k3u1fbpfcp-watermark.image?)

历史构建记录保存好后，需要创建一个**node**服务和一个前端可视化回滚页面来实现回滚逻辑，实现步骤：

1.  在前端可视化页面选择某一次构建记录后，把**id**传给**node**服务器。
2.  服务器根据**id**找到对应的**html**内容，用**html**内容替换**dist/index.html**的内容。
3.  替换完成后用户访问页面就可以访问到对应版本的内容了，实现了秒级回滚。

### 3.3 模拟服务端托管前端应用

前端项目打包成**html**，**css**，**js**静态资源后，一般会由**nginx**等进行托管，实现外网访问，本文使用前端的一个静态资源服务器[serve](https://www.npmjs.com/package/serve)来托管我们打包后的资源。

先全局安装（**mac需要加sudo**）：

```bash
npm i serve -g
```

安装完成后进入到我们的快速回滚**quick\_rollback**项目下面，执行**serve**的命令，托管**dist**文件夹静态资源：

```bash
serve -s dist
```

启动成功后，终端会显示托管后的访问地址，浏览器打开该地址就可以看到项目已经可以访问到了。

![4.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ca90bb92204940c7b0cba26d4b67b6e1~tplv-k3u1fbpfcp-watermark.image?)

### 3.4 快速回滚node服务端代码开发

先创建一个**server.mjs**来写服务端的代码，服务端要做的事情：

1.  启动一个**3001**端口的服务。
2.  访问根路径的时候返回一个前端可视化回滚的页面。
3.  提供 **/history**接口给前端页面提供历史构建记录数据。
4.  提供 **/rollback**接口给前端页面提供回滚到哪一版本的接口。
5.  处理 **/rollback**回滚逻辑，找到对应版本的**html**内容，去替换**dist/index.html**文件内容。

**1. 在项目根目录新建一个server.mjs**

先用**http**创建一个基础的服务器:

```js
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

const server = http.createServer((req, res) => {
  // 获取请求的路径
  const { pathname } = url.parse(req.url, true);
  // 获取请求的方法
  const method = req.method.toLowerCase();
	
  // ... 后续的代码都会写在这里
})

server.listen(3001, () => {
  console.log('server is running on http://localhost:3001')
});
```

**2. 添加根路径接口，返回rollback.html可视化回滚页面**

回滚在前端可视化页面操作会更方便，在项目根目录创建一个**rollback.html**文件，添加简单代码：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <title>rollback</title>
  </head>
  <body>
  </body>
</html>
```

然后修改**server.mjs**文件，添加根路径接口：

```js
// server.mjs

// 如果请求的是根路径，就返回rollback.html
if(pathname === '/' && method === 'get') {
	res.writeHead(200, { 'Content-Type': 'text/html' }, 'utf-8')
	res.end(fs.readFileSync(path.resolve('./rollback.html'), 'utf-8'))
}
```

这样当**node server.mjs**启动服务器访问<http://localhost:3001>地址的时候就会访问到**rollback.html**页面。

**3.添加获取构建记录接口**

在**rollback.html**可视化页面我们要获取到历史构建记录，才方便进行回滚操作，需要在服务端提供接口把**history.json**文件内容返回回来，修改**server.mjs**文件，添加代码：

```js
// 如果请求的是history，就返回history.json的内容
if(pathname === '/history' && method === 'get') {
  res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
  res.end(JSON.stringify({
  	code: 200,
  	mssage: '操作成功',
  	data: JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'))
  }))
}
```

**4.添加快速回滚到接口**

可视化页面访问到历史构建记录后，就可以选择一个历史版本来进行回滚，所以服务端要提供回滚接口，修改**server.mjs**，添加代码：

```js
// 如果请求的是rollback，就将对应版本的html内容写入到dist/index.html中
if(pathname === '/rollback' && method === 'get') {
  res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
  const { query } = url.parse(req.url, true);
  const { id } = query;
  const history = JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'));
  const html = history.list.find(item => item.id === id).html;
  fs.writeFileSync(path.resolve('./dist/index.html'), html);
  res.end(JSON.stringify({
    code: 200,
    mssage: '操作成功',
    data: {}
  }));
}
```

代码逻辑比较简单：

1.  提供了**get**请求 **/rollback**接口。
2.  接收**query**参数**id**。
3.  获取到**history**的历史构建记录数据。
4.  拿**id**和历史构建记录数据做对比，查找到对应的构建记录。
5.  拿到对应的**index.html**内容，去修改 **./dist/index.html**，实现快速回滚操作。
6.  然后给前端响应。

到这里服务端的基础逻辑就写好了，开始写快速回滚可视化页面**rollback.html**的代码了。

完整**server.mjs**代码：

```js
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';

const server = http.createServer((req, res) => {
  // 获取请求的路径
  const { pathname } = url.parse(req.url, true);
  // 获取请求的方法
  const method = req.method.toLowerCase();

  // 如果请求的是根路径，就返回rollback.html
  if(pathname === '/' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'text/html' }, 'utf-8')
    res.end(fs.readFileSync(path.resolve('./rollback.html'), 'utf-8'))
  }

  // 如果请求的是history，就返回history.json的内容
  if(pathname === '/history' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
    res.end(JSON.stringify({
      code: 200,
      mssage: '操作成功',
      data: JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'))
    }))
  }

  // 如果请求的是rollback，就将对应版本的html内容写入到dist/index.html中
  if(pathname === '/rollback' && method === 'get') {
    res.writeHead(200, { 'Content-Type': 'application/json' }, 'utf-8')
    const { query } = url.parse(req.url, true);
    const { id } = query;
    const history = JSON.parse(fs.readFileSync(path.resolve('./history.json'), 'utf-8'));
    const html = history.list.find(item => item.id === id).html;
    fs.writeFileSync(path.resolve('./dist/index.html'), html);
    res.end(JSON.stringify({
      code: 200,
      mssage: '操作成功',
      data: {}
    }));
  }
})

server.listen(3001, () => {
  console.log('server is running on http://localhost:3001')
});
```

### 3.5 快速回滚前端可视化页面开发

前端页面也比较简单，界面准备一个**select**选择框选择回滚的版本，和一个**确定按钮**来确定回滚操作。

为了从**dom**操作中解放出来，这里会用尤大大开发的[petite-vue](https://www.npmjs.com/package/petite-vue)来开发前端页面。

**petite-vue** 是 **Vue** 的可替代发行版，针对渐进式增强进行了优化。它提供了与标准 **Vue** 相同的模板语法和响应式模型：

*   大小只有5.8kb
*   Vue 兼容模版语法
*   基于DOM，就地转换
*   响应式驱动

修改**rollback.html**，添加**select**和**button**按钮元素，再引入**petite-vue**的**cdn**文件进行实例化:

1.  在实例初始化后立即请求获取构建记录列表，赋值给**this.historyList**。
2.  页面上构建记录遍历生成了**select**选择项**option**，**v-model**绑定值为**this.currentItem**。
3.  **button**按钮是回滚确定按钮，点击后会先判断有没有选择回滚版本。
4.  没有选择就提示，选择了借助**confirm**来二次确认。
5.  确认后调用服务端回滚接口把**id**传过去，根据响应内容获取执行结果。

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>rollback</title>
  </head>
  <body>
    <script src="https://cdn.bootcdn.net/ajax/libs/petite-vue/0.4.1/petite-vue.umd.min.js"></script>
    <div id="app" @vue:mounted="onMounted">
      <select v-model="currentItem">
        <option value="">请选择回滚版本</option>
        <option v-for="item in historyList" :key="item.id" :value="item">发版时间：{{ item.time }}</option>
      </select>
      <button @click="onRollback">回滚</button>
    </div>
  </body>
  <script>
    /** vue实例 */
    PetiteVue.createApp({
      historyList: [], // 构建记录列表
      currentItem: undefined, // 当前选中的项目
      onMounted() {
        this.getHistory();
      },
      /** 获取构建记录列表 */
      getHistory() {
        fetch("/history").then(res => res.json()).then(res => {
          if (res.code === 200) {
            this.historyList = res.data.list;
          }
        });
      },
      /** 代码回滚 */
      onRollback() {
        if (!this.currentItem) return alert("请选择回滚目标版本!");
        const isRollback = confirm(`确认项目回滚到${this.currentItem.time}版本!`);
        if (isRollback) {
          fetch(`/rollback?id=${this.currentItem.id}`).then(res => res.json()).then(res => {
            if (res.code === 200) {
              alert("快速回滚成功!");
            }
          });
        }
      },
    }).mount("#app");
  </script>
</html>
```

### 3.6 快速回滚测试

上面打包生成了两个构建版本页面，两个版本页面h1标签展示的分别是`Vite + React`和`Vite + React + 快速回滚`，先用**serve**把当前**dist**文件夹静态资源托管运行起来：

```bash
serve -s dist
```

打开项目地址浏览器看到现在的内容：

![4.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/84bb49fe097e48fbbc58b263005e6c28~tplv-k3u1fbpfcp-watermark.image?)

再新开一个终端，启动我们的服务端代码：

```bash
node server.mjs
```

然后打开<http://localhost:3001页面>

![5.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/946635235a0a4387b7c12883b89c87a3~tplv-k3u1fbpfcp-watermark.image?)

我们选择发版时间较早的那个版本，那个版本对应的页面展示是`Vite + React + 快速回滚`，选择完成后，点击回滚，进行二次确认，看到下面的提示，代表回滚成功了：

![6.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/daa7d9fef91248d6ab2cde99c33a02ea~tplv-k3u1fbpfcp-watermark.image?)

这个时候再返回前端**react**项目页面，刷新一下浏览器，可以看到页面内容变成了我们回滚的版本：

![7.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/68c7c9b5775b4d0dbbcdb030533ef092~tplv-k3u1fbpfcp-watermark.image?)

到了这里，秒级回滚的核心功能就已经完成了。

## 四. 总结

这种保留历史构建代码的方式还可以规避两个常见的问题：

1.  前端构建时**dist**文件被清空，此时前端访问项目会访问不到。
2.  用了路由懒加载，新版本发布后，原文件消失，用户跳转页面请求资源会**404**，造成页面异常。

可谓是一举多得，但只到现在这步，还会有一个问题，因为没有删除历史构建文件，会越积越多，造成存储资源浪费。

解决方案是修改**build.mjs**文件，只保留最近**5次**的构建结果，**5次**之外的构建资源去进行删除，这样既能实现秒级回滚，又不会造成太多的资源浪费。

这里提供一下实现思路：

1.  每一次构建时都获取一下本次构建生成的所有静态资源文件。
2.  获取到后保存在当前的构建记录里面。
3.  同时把文件名称都保存一个**files.json**文件里面，文件路径作为**key**。
4.  每一次构建结束后判断当前构建的总次数，如果超过**5次**。
5.  就获取到最早一次构建生成的静态资源文件列表。
6.  用最早生成的静态资源文件在整体的文件**files.json**里面做对比。
7.  如果后面五次构建都没用到最早一次构建产生的文件，那该文件就可以做删除操作了。

一般回滚都是回滚到上一个版本，很少会出现回滚到超过5个版本的情况，如果真的有该情况，就重新打包构建。

本文只是提供了一种前端线上项目秒级回滚的思路，适合所有的单页应用项目，我现在所在的公司就是采用的这种方案，但实际使用起来要复杂一些，需要封装一个公共的项目，和项目之间解耦，方便每一个项目使用。

构建记录要以项目为单位存在数据库或者**oss**的**json**文件里面，可视化管理平台可以控制所有的项目，可以进行单独项目各自分支的快速回滚。

除了这种方式还有其他很多的方式实现秒级回滚，本方式相对来说实现简单成本也低，应用也广泛。

后面会再出一篇使用**docker**实现项目快速回滚的方案，万金油方案，前端单页，多页，还有服务端项目都可以用**docker**来实现快速回滚。