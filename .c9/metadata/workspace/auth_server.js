{"changed":true,"filter":false,"title":"auth_server.js","tooltip":"/auth_server.js","value":"require('console-stamp')(console, '[HH:MM:ss.l]');\nvar oauth2orize = require('oauth2orize');\nvar utils = require('./js/utils');\nvar randtoken = require('rand-token');\nvar crypto = require('crypto');\nvar passport = require('passport');\nvar express = require('express');\nvar cookieParser = require('cookie-parser');\nvar bodyParser = require('body-parser');\nvar session = require('express-session');\nvar MongoStore = require('connect-mongo')(session);\nvar MongoClient = require('mongodb').MongoClient;\nvar login = require('connect-ensure-login');\nvar util = require('util');\nvar bcrypt = require('bcrypt');\nvar jade = require('jade');\nvar async = require('async');\nvar helmet = require('helmet');\nvar CMD = require('./js/common-const').cmd;\nvar fs = require('fs');\nvar execFile = require('child_process').execFile;\nvar execFileSync = require('child_process').execFileSync;\n\nvar LocalStrategy = require('passport-local').Strategy;\nvar BasicStrategy = require('passport-http').BasicStrategy;\nvar ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy;\nvar BearerStrategy = require('passport-http-bearer').Strategy;\nvar nodemailer = require('nodemailer');\n\nvar GLOBAL = {\n  serverAddress: 'http://164.125.70.62',\n  serverPort: 3000,\n  mongoStoreOptions: {\n    ttl: 60 * 60 * 24 * 7,\n    autoRemove: true,\n    url: 'mongodb://localhost:27017/zolgwa-oauth2'\n  },\n  smtpConfig: {\n    host: 'smtp.gmail.com',\n    port: 465,\n    secure: true,\n    auth: {\n      user: '',\n      pass: ''\n    }\n  },\n  APIKEY_LENGTH: 16, \n  CSV_ROOT: __dirname + /csv/,\n  db: null\n};\n\nvar mongoUrl = 'mongodb://localhost:27017/zoldata2';\n\nvar DB_NAME = {\n  SESSION: 'zolgwa',\n  REALDB: 'zoldata' \n};\n\nvar TABLE_NAME = {\n  USER: 'user',\n  CLIENT: 'client',\n  AUTHORIZATION_CODE: 'authorization_code' ,\n  ACCESS_TOKEN: 'access_token',\n  API: 'api',\n  EMAIL_TOKEN: 'email_token'\n};\n\n\nvar app = express();\nvar transporter = nodemailer.createTransport(GLOBAL.smtpConfig);\napp.use(cookieParser());\napp.use(bodyParser.urlencoded({limit: '50mb', extended: true}));\napp.use(bodyParser.json({limit: '50mb'}));\napp.use(session({\n  domain: '.app.localhost',\n  secret: 'zolgwa2',\n  saveUninitialized: false,\n  resave: false,\n  store: new MongoStore(GLOBAL.mongoStoreOptions),\n  name: 'connect.auth'\n}));\n\napp.use(passport.initialize());\napp.use(passport.session());\napp.use(express.static(__dirname));\napp.use(function(req, res, next) {\n  res.header('Access-Control-Allow-Credentials', true);\n  res.header('Access-Control-Allow-Origin', req.headers.origin);\n  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');\n  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');\n  if ('OPTIONS' == req.method) {\n    res.send(200);\n  } else {\n    next();\n  }\n});\nvar server = oauth2orize.createServer();\n\nfunction printError(err) {\n  return console.error(err);\n}\n\nfunction cryptPassword(password, callback) {\n  bcrypt.genSalt(10, function(err, salt) {\n    if (err) \n      return callback(err);\n    bcrypt.hash(password, salt, function(err, hash) {\n      return callback(err, hash);\n    });\n  });\n}\n\nfunction comparePassword(password, userPassword, callback) {\n  bcrypt.compare(password, userPassword, function(err, isPasswordMatch) {\n    if (err)\n      return callback(err);\n    return callback(null, isPasswordMatch);\n  });\n}\n\nfunction jadeRead(res, p, varlist) {\n  var fn = jade.compileFile(__dirname + p, {\n      basedir: __dirname\n  });\n  res.writeHead(200, {'Content-Type': 'text/html'});\n  res.end(fn(varlist));\n}\n\nvar passportLogin = function(userId, password, passportDone) {\n  async.waterfall([\n    function(done) {\n      GLOBAL.db.collection(TABLE_NAME.USER).findOne({id: userId}, function(err, doc) {\n        if (err) return printError(err);\n        console.log(doc);\n        if (doc) {\n          if (doc.valid) {\n            return done(null, doc.password);  \n          } else {\n            return passportDone(null, false, {\n              succes: false,\n              message: '이메일인증을 하지 않은 아이디입니다.'\n            });\n          }\n        } else {\n          return passportDone(null, false, {\n            success: false,\n            message: '존재하지 않는 아이디입니다.'\n          });\n        }\n      });\n    }, function(userPassword, done) {\n      comparePassword(password, userPassword, function(err, matched) {\n        if (err) return printError(err);\n        if (matched) {\n          return passportDone(null, {\n            id: userId\n          }, {\n            success: true\n          });\n        }\n        return passportDone(null, false, {\n          success: false,\n          message: '비밀번호가 틀립니다.'\n        });\n      });\n    }\n  ]);\n};\n\npassport.serializeUser(function(user, done) {\n  console.log('serialize user');\n  return done(null, user.id);  \n});\n\npassport.deserializeUser(function(id, done) {\n  console.log('deserialize user');\n  GLOBAL.db.collection(TABLE_NAME.USER).findOne({id: id}, function(err, doc) {\n    if (err) return printError(err);\n    return done(err, doc);\n  });\n});\n\napp.use(helmet());\n\nserver.serializeClient(function(client, done) {\n  console.log('serializeClient', client);\n  return done(null, client._id);\n});\n\nserver.deserializeClient(function(id, done) {\n  console.log('deserializeClient');\n  GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({_id: id}, function (err, client) {\n    if (err) return done(err);\n    return done(null, client);\n  });\n});\n\nserver.grant(oauth2orize.grant.code(function(client, redirectURI, user, ares, done) {\n  console.log('grant code');\n  console.log('Client: ', client);\n  console.log('RedirectURI: ', redirectURI);\n  console.log('User: ' , user);\n  \n  var now = new Date().getTime();\n  var code = crypto.createHmac('sha1', 'access_token')\n    .update([client.id, now].join())\n    .digest('hex');\n    \n  var id = user ? user.id : null;\n  GLOBAL.db.collection(TABLE_NAME.AUTHORIZATION_CODE).insertOne({\n    code: code,\n    client_id: client.client_id,\n    redirect_uri: redirectURI,\n    user_id: id,\n    scope: ares.scope\n  }, function(err, doc)   {\n    if (err) return done(err);  \n    return done(null, code);\n  });\n}));\n  \nserver.exchange(oauth2orize.exchange.code(function(client, code, redirectURI, done) {\n  console.log('exchange code');\n  console.log('Client: ', client);\n  console.log('Code: ', code);\n  \n  GLOBAL.db.collection(TABLE_NAME.AUTHORIZATION_CODE).findOne({code: code}, function(err, code) {\n    if (err) return done(err);\n    if (!code) return done(null, false);\n    if (client.client_id.toString() !== code.client_id.toString()) return done(null, false);\n    if (redirectURI !== code.redirect_uri) return done(null, false);\n    var now = new Date().getTime();\n    var token = crypto.createHmac('sha1', 'access_token')\n        .update([client.id, now].join())\n        .digest('hex');\n    GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).insertOne({\n      oauth_token: token,\n      user_id: code.user_id,\n      client_id: code.client_id,\n      scope: code.scope\n    }, function(err) {\n      if (err) return done(err);\n      return done(null, token);\n    });\n  });\n}));\n\nserver.grant(oauth2orize.grant.token(function(client, user, ares, done) {\n  console.log('grant token');\n  console.log('Client: ', client);\n  console.log('User: ', user);\n  var token = utils.uid(256);\n  GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).insertOne({\n    oauth_token: token,\n    user_id: user.id,\n    client_id: client.client_id,\n    scope: ares.scope\n  }, function(err, doc) { \n    if (err) return done(err);\n    return done(null, token);   \n  });\n}));\n\nserver.exchange(oauth2orize.exchange.password(function(client, username, password, scope, done) {\n  console.log('exchange password');\n  GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n    client_id: client.client_id\n  }, function(err, localClient) {\n    if (err) { return done(err); }\n    if(localClient === null) {\n      return done(null, false);\n    }\n    if(localClient.client_secret !== client.client_secret) {\n      return done(null, false);\n    }\n    //Validate the user\n    GLOBAL.db.collection(TABLE_NAME.USER).findOne({\n      user_id: username  \n    }, function(err, user) { \n      if (err) { return done(err); }\n      if(user === null) {\n        return done(null, false);\n      }\n      if(password !== user.password) {\n        return done(null, false);\n      }\n      //Everything validated, return the token\n      var token = utils.uid(256);\n      GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).insertOne({\n        oauth_token: token,\n        user_id: user.user_id,\n        client_id: client.client_id\n      }, function(err) {\n        if (err) { return done(err); }\n        return done(null, token);\n      });\n    });\n  });\n}));\n\nserver.exchange(oauth2orize.exchange.clientCredentials(function(client, scope, done) {\n  console.log('client credentials');\n  GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n    client_id: client.client_id\n  }, function(err, localClient) {\n    if (err) { return done(err); }\n    if(localClient === null) {\n      return done(null, false);\n    }\n    if(localClient.client_secret !== client.client_secret) {\n      return done(null, false);\n    }\n    var token = utils.uid(256);\n    //Pass in a null for user id since there is no user with this grant type\n    GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).insertOne({\n      oauth_token: token,\n      user_id: null,\n      client_id: client.client_id\n    }, function(err) {\n      if (err) return done(err); \n      return done(null, token);\n    });\n  });\n}));\n\n\napp.all('/*', function(req, res, next) {\n  console.log(req.method, req.originalUrl);\n  next();\n});\n\napp.get('/login', function(req, res, next) {\n  return jadeRead(res, '/jade/login.jade', {user: req.user});\n});\n\napp.post('/login', function(req, res, next) {\n  passport.authenticate('local', function(err, user, info) {\n    if (err) return printError(err);\n    if (user) {\n      req.login(user, function(err) {\n        if (err)\n          return printError(err);\n        return res.json(info);\n      });\n    } else {\n      return res.json(info);\n    }\n  })(req, res, next);\n});\n\napp.get('/test', function(req, res, next){\n    // authorizationURL: 'http://164.125.70.62:3000/auth',\n    // tokenURL: 'http://164.125.70.62:3000/token',\n    // clientID: '123-456-789',\n    // clientSecret: 'shhh-its-a-secret',\n    // callbackURL: 'http://164.125.70.62:8080/oauth2/callback'\n  // GLOBAL.db.collection(TABLE_NAME.CLIENT).remove({\n  //   client_id: '123-456-789'  \n  // }, function(err) {\n  //   console.log(err); \n  //   console.log('good');\n  // });\n  // GLOBAL.db.collection(TABLE_NAME.CLIENT).insertOne({\n  //   id: '1',\n  //   name: 'app',\n  //   client_id: '123-456-789',\n  //   client_secret: 'shhh-its-a-secret',\n  //   redirect_uri: 'http://164.125.70.62:8080/oauth2/callback'\n  // }, function(err) {\n  //   if (err) {\n  //     return console.log(err);\n  //   }\n  //   return console.log('good');\n  // });\n  \n  // GLOBAL.db.collection(TABLE_NAME.USER).updateOne({\n  //   id: 'admin'\n  // }, {$set:{email: '4dimensionn@naver.com'}}, function(err, doc) {\n  //   if (err) return;\n  //   console.log(err, doc);\n  // });\n});\n\napp.post('/logout', \n  login.ensureLoggedIn('/login'),\n  function(req, res, nxt) {\n    req.logout();  \n    return res.json({\n      success: true\n    });\n  });\n\napp.get('/signup', login.ensureLoggedOut(), function(req, res, next) {\n  if(req.user) return res.redirect('/');\n  return jadeRead(res, '/jade/signup.jade', {\n  });\n});\n\napp.post('/signup', login.ensureLoggedOut(), function(req, res, next) {\n  var body = req.body;\n  //email, name, password, confirm\n  if (body.email.length > 50) return res.redirect('/');\n  if (body.user_id.length > 50) return res.redirect('/');\n  if (body.password.length  > 100) return res.redirect('/');\n  GLOBAL.db.collection(TABLE_NAME.USER).findOne({\n    $or:[\n      {email:body.email},\n      {id:body.user_id}]}, function(err, doc) {\n    if (err) {\n      return res.json({\n        success: false,\n        message: err\n      });\n    }\n    if (doc) {\n      return res.json({\n        success: false,\n        message: 'already exists'\n      });\n    } else {\n      var token = randtoken.uid(GLOBAL.APIKEY_LENGTH);\n      var userEmail = body.email;\n      var mailSubject = '회원가입 인증 메일입니다.';\n      var mailContent = body.user_id + \n          '님 가입하신 것을 환영합니다. ' +\n          '<a href =\\'' + GLOBAL.serverAddress + '/eauth?q=' +\n          token + '\\'>인증</a>';\n      var mailData = {\n        from: 'aoj.service@gmail.com',\n        to: userEmail,\n        subject: mailSubject,\n        html: mailContent\n      };\n      transporter.sendMail(mailData, function(err, info) {\n        if (err) {\n          console.error(err);\n          return res.json({\n            success: false,\n            message: err\n          });\n        }\n        GLOBAL.db.collection(TABLE_NAME.EMAIL_TOKEN).insertOne({\n          token: token,\n          id: body.user_id\n        });\n        cryptPassword(body.password, function(err, hash) {\n          if (err) {\n            console.error(err);\n            return res.json({\n              success: false,\n              message: err\n            });\n          } \n          GLOBAL.db.collection(TABLE_NAME.USER).insertOne({\n            id: body.user_id,\n            email: body.email,\n            password: hash,\n            valid: false\n          }, function(err, r) {\n            if (err) {\n              console.error(err);\n              return res.json({\n                success: false,\n                message: err\n              });\n            }\n            return res.json({\n              success: true\n            });\n          });\n        });\n      });\n    }\n  });\n});\n\napp.get('/eauth', login.ensureLoggedOut(), function(req, res) {\n  var token = req.query.q; \n  GLOBAL.db.collection(TABLE_NAME.EMAIL_TOKEN).findOne({\n    token: token\n  }, function(err, doc) {\n    if (err) {\n      return printError(err);\n    }\n    \n    GLOBAL.db.collection(TABLE_NAME.USER).updateOne({\n      id: doc.id\n    }, {\n      $set: {valid: true}\n    }, function(err) {\n      if (err) {\n        return printError(err);\n      }\n      return res.redirect('/login');\n    });\n  });\n});\n\n\napp.get('/auth', [\n  function(req, res, next) {\n    console.log(req);\n    console.log(req.query);\n    var redirectURI = '/login?redirect_uri=' + req.query.redirect_uri || '/login';\n    console.log(redirectURI);\n    return login.ensureLoggedIn(redirectURI)(req, res, next);\n  },\n  server.authorization(function(clientID, redirectURI, done) {\n    console.log('authorization');\n    console.log('ClientID: ', clientID);\n    console.log('RedirectURI: ', redirectURI);\n    GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n      client_id: clientID    \n    }, function(err, doc) {\n      if (err) return done(err); \n      return done(null, doc, redirectURI);\n    });\n  },\n  function(client, user, done) {\n    console.log(client, user);\n    return done(null, true);\n  }),\n  function(req, res) {\n    return res.json({\n      transactionID: req.oauth2.transactionID,\n      user: req.user,\n      client: req.oauth2.client\n    });\n  }\n]);\n\napp.get('/api/auth', [\n  server.authorization(function(clientID, redirectURI, done) {\n    GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n      client_id: clientID    \n    }, function(err, doc) {\n      if (err) return done(err); \n      if (doc.redirect_uri != redirectURI) return done(null, false);\n      return done(null, doc, redirectURI);\n    });\n  },\n  function(client, user, done) {\n    return done(null, true);\n  }),\n  function(req, res) {\n    return res.json({\n      transactionID: req.oauth2.transactionID,\n      user: req.user,\n      client: req.oauth2.client\n    });\n  }\n]);\n\napp.get('/auth/decision', \n  login.ensureLoggedIn(),\n  server.decision());\n  \npassport.use(new LocalStrategy({\n    usernameField: 'id',\n    passwordField: 'password'\n  },\n  passportLogin\n));\n\npassport.use(new BasicStrategy(\n  function (username, password, done) {\n    console.log('basic Strategy');\n    GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n    }, function(err, client) {\n      if (err) return done(err);\n      if (!client) return done(null, false);\n      if (client.secret != password) return done(null, false);\n      return done(null, client); \n    });\n  }\n));\n\n\n\npassport.use('oauth2-client-password-user', new ClientPasswordStrategy(\n  function(clientId, clientSecret, done) {\n    console.log('oauth2-client-password Strategy');\n    GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n      client_id: clientId\n    }, function(err, client) {\n      if (err) return done(err);  \n      if (!client) return done(null, false);\n      if (client.client_secret != clientSecret) return done(null, false);\n      return done(null, client);\n    });\n  }\n));\n\npassport.use('oauth2-cilent-password-api', new ClientPasswordStrategy(\n  function(clientId, clientSecret, done) {\n    GLOBAL.db.collection(TABLE_NAME.CLIENT).findOne({\n      client_id: clientId\n    }, function(err, client) {\n      if (err) return done(err);  \n      if (!client) return done(null, false);\n      if (client.client_secret != clientSecret) return done(null, false);\n      return done(null, client);\n    });\n  }\n));\n\npassport.use(new BearerStrategy(\n  function (accessToken, done) {\n    GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).findOne({\n      oauth_token: accessToken\n    }, function(err, token) {\n      if (err) return done(err);\n      if (!token) return done(null, false);\n      GLOBAL.db.collection(TABLE_NAME.USER).findOne({\n        id: token.user_id\n      }, function(err, user) {\n        if (err) return done(err);\n        if (!user) return done(null, false);\n        var info = {scope: '*'};  \n        return done(null, user, info);\n      });\n    });\n  }\n));\n\npassport.use('bearer-api', new BearerStrategy(\n  function (accessToken, done) {\n    GLOBAL.db.collection(TABLE_NAME.ACCESS_TOKEN).findOne({\n      oauth_token: accessToken\n    }, function(err, token) {\n      if (err) return done(err);\n      if (!token) return done(null, false);\n      GLOBAL.db.collection(TABLE_NAME.USER).findOne({\n        id: token.user_id\n      }, function(err, user) {\n        if (err) return done(err);\n        if (!user) return done(null, false);\n        var info = {scope: '*'};  \n        return done(null, user, info);\n      });\n    });\n  }\n));\n\napp.post('/api/request', passport.authenticate('bearer', {session: false}), function(req, res) {\n  var body = req.body;\n  var exePy = CMD[body.method];\n  if (!exePy) {\n    return res.json({\n      err: '지원하지 않는 method입니다.'  \n    });\n  }\n  var randNum = randtoken.uid(GLOBAL.APIKEY_LENGTH);\n  var inp = body.inp;\n  var keys = [];\n  var values = [];\n  for (var key in inp) {\n    keys.push(key);\n    values.push(inp[key]);\n  }\n  var inpStr = keys.join(',') + '\\n' + values.join(',');\n  console.log(inpStr);\n  fs.writeFile(__dirname + '/data/' + body.apiKey + '/request/' + randNum + '.csv', inpStr, 'utf-8', function(err, result) {\n    if (err) {\n      printError(err);\n      return res.json({\n        err: err\n      });\n    }      \n    var exeParam = [__dirname + '/py/' + exePy + '/request_' + exePy + '.py', body.apiKey, randNum];\n    exeParam.push(randNum);\n    execFile('python', exeParam, function(err, stdout, stderr) {\n      console.log(err);\n      console.log(stdout);\n      console.log(stderr);\n      fs.readFile(__dirname + '/data/' + exePy + '/request/' + randNum + '.req', 'utf-8', function(err, result) {\n        if (err) {\n          return res.json({\n            success: false,\n            err: err\n          });\n        }\n        return res.json({\n          success: true,\n          data: result\n        });\n      });\n    });\n  });\n});\n\napp.get('/api/me',\n  passport.authenticate('bearer', { session: false }),\n  function(req, res) {\n    return res.json(req.user);\n  });\n  \napp.post('/token', [\n  passport.authenticate(['basic', 'oauth2-client-password-user']),\n  server.token(),\n  server.errorHandler()\n]);\n\napp.post('/api/token', [\n  passport.authenticate(['oauth2-client-password-api']),\n  server.token(),\n  server.errorHandler()\n]);\n\nMongoClient.connect(mongoUrl, function(err, db) {\n  if (err) {\n    return printError(err);\n  }\n  console.log('Mongo client connected');\n  GLOBAL.db = db;\n  app.listen(3000, function() {\n    console.log(util.format('Auth Server is running. %s:%d', \n      GLOBAL.serverAddress, 3000));\n  });\n});\n","undoManager":{"mark":-2,"position":-1,"stack":[[{"start":{"row":507,"column":32},"end":{"row":507,"column":38},"action":"remove","lines":["client"],"id":2}]]},"ace":{"folds":[],"scrolltop":9244,"scrollleft":0,"selection":{"start":{"row":363,"column":15},"end":{"row":363,"column":15},"isBackwards":false},"options":{"guessTabSize":true,"useWrapMode":false,"wrapToView":true},"firstLineState":{"row":35,"state":"no_regex","mode":"ace/mode/javascript"}},"timestamp":1477735130144}