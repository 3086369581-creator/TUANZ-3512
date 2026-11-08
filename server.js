const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 数据库
const db = new sqlite3.Database('./data.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    token TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid INTEGER,
    src TEXT,
    desc TEXT,
    likes INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_uid INTEGER,
    to_uid INTEGER,
    UNIQUE(from_uid, to_uid)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_uid INTEGER,
    to_uid INTEGER,
    content TEXT,
    time TEXT
  )`);
});

// 生成token
function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now();
}

// 注册
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT id FROM users WHERE username=?`, [username], (err, row) => {
    if (row) return res.json({ ok: false, msg: '用户名已存在' });
    db.run(`INSERT INTO users(username,password) VALUES(?,?)`, [username, password], function () {
      res.json({ ok: true });
    });
  });
});

// 登录
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT id FROM users WHERE username=? AND password=?`, [username, password], (err, row) => {
    if (!row) return res.json({ ok: false, msg: '账号密码错误' });
    const token = makeToken();
    db.run(`UPDATE users SET token=? WHERE id=?`, [token, row.id]);
    res.cookie('token', token, { maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ ok: true, uid: row.id, username });
  });
});

// 校验登录
app.get('/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ login: false });
  db.get(`SELECT id,username FROM users WHERE token=?`, [token], (err, u) => {
    if (!u) return res.json({ login: false });
    res.json({ login: true, uid: u.id, username: u.username });
  });
});

// 退出登录
app.post('/logout', (req, res) => {
  const token = req.cookies.token;
  db.run(`UPDATE users SET token=null WHERE token=?`, [token]);
  res.clearCookie('token');
  res.json({ ok: true });
});

// 上传视频
app.post('/upload', upload.single('video'), (req, res) => {
  const { uid, desc } = req.body;
  const src = req.file.path.replace('\\', '/');
  db.run(`INSERT INTO videos(uid,src,desc) VALUES(?,?,?)`, [uid, src, desc], function () {
    res.json({ ok: true, vid: this.lastID });
  });
});

// 获取视频列表
app.get('/videos', (req, res) => {
  db.all(`SELECT v.*, u.username FROM videos v LEFT JOIN users u ON v.uid=u.id ORDER BY v.id DESC`, (err, list) => {
    res.json(list);
  });
});

// 点赞
app.post('/like', (req, res) => {
  const { vid } = req.body;
  db.run(`UPDATE videos SET likes=likes+1 WHERE id=?`, [vid], () => res.json({ ok: true }));
});

// 关注
app.post('/follow', (req, res) => {
  const { from, to } = req.body;
  db.run(`INSERT OR IGNORE INTO follows(from_uid,to_uid) VALUES(?,?)`, [from, to], () => res.json({ ok: true }));
});

// 是否关注
app.get('/isfollow', (req, res) => {
  const { from, to } = req.query;
  db.get(`SELECT id FROM follows WHERE from_uid=? AND to_uid=?`, [from, to], (err, row) => {
    res.json({ is: !!row });
  });
});

// 发消息
app.post('/sendmsg', (req, res) => {
  const { from, to, content } = req.body;
  const t = new Date().toLocaleString();
  db.run(`INSERT INTO messages(from_uid,to_uid,content,time) VALUES(?,?,?,?)`, [from, to, content, t], () => res.json({ ok: true }));
});

// 获取聊天记录
app.get('/msgs', (req, res) => {
  const { a, b } = req.query;
  db.all(`SELECT m.*,u.username FROM messages m LEFT JOIN users u ON m.from_uid=u.id WHERE (from_uid=? AND to_uid=?) OR (from_uid=? AND to_uid=?) ORDER BY id ASC`, [a, b, b, a], (err, data) => {
    res.json(data);
  });
});

// 获取所有用户（用于聊天）
app.get('/allusers', (req, res) => {
  db.all(`SELECT id,username FROM users`, (err, list) => res.json(list));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`服务器运行：http://127.0.0.1:${PORT}`);
  console.log('同局域网其他设备访问：http://你电脑IP:3000');
});
