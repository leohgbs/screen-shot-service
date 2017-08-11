# Screenshot as a Service
[项目原地址](https://github.com/fzaninotto/screenshot-as-a-service)

# 修改功能
- 路由增加前缀(/screen)
- rasteriser 截图提高图片质量(Retina 渲染)
- 增加七牛上传, 直接返回上传完成的url(使用该方法增加 upload 参数)
- 默认返回图片 base64 编码
- 渲染增加 wait for 等待资源渲染完成后再 render

# 注意
- 服务器无法渲染中文, 需要为服务器增加中文字体
- css3最新属性需要加一些前缀, phantomjs 还不支持部分功能，如
```
      display: -webkit-box;
      display: -webkit-flex;
      display: flex;
      -webkit-box-pack: center;
      -webkit-flex-direction: column;
      flex-direction: column;
      -webkit-justify-content: center;
      justify-content: center;
```
- 在判断是否渲染完成的地方, 加了一个项目相关的变量 window.DATAREADY && img 是否加载完成 来判断(可自行修改)
- 七牛上传 zone 目前为 Zone_z2(华南地区), 没有增加配置

## Setup

First [install](http://code.google.com/p/phantomjs/wiki/Installation) phantomjs, then clone this repo and install the deps:

```
$ npm install
```

Run the app:

```
$ node app
Express server listening on port 3000
```

