require('dotenv').config();
const express = require('express');
const app = express();
const pool = require('./db');
const session = require('express-session');
const passport = require('passport');
require('./passport');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-session-key',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

app.get('/', async (req, res) => {
  const result = await pool.query('SELECT NOW()');
  res.send(`Hello Minecraft Auth! Server time: ${result.rows[0].now}`);
});

app.post('/verify-code', async (req, res, next) => {
  const { code } = req.body;

  try {
    const result = await pool.query(`
      SELECT * FROM user_auth
      WHERE auth_code = $1 AND verified_at IS NULL AND code_expire_at > NOW() AND banned = FALSE
    `, [code]);

    if (result.rowCount === 0) {
      return res.send('認証コードが無効か期限切れです。');
    }

    const uuid = result.rows[0].uuid;
    req.session = req.session || {};
    req.session.uuid = uuid;
    req.session.code = code;

    res.redirect('/auth/google');

  } catch (err) {
    console.error('認証コード確認エラー:', err);
    res.send('サーバーエラー');
  }
});


app.get('/auth/google',
  passport.authenticate('google', { scope: ['email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failed' }),
  async (req, res) => {
    const uuid = req.user.uuid;
    const email = req.user.email;

    if (!uuid) return res.send('UUIDが見つかりません');
    if (!email) return res.send('メールアドレスが見つかりません');

    const regex = /^[^@]+@([^.]+\.)*chibakoudai\.jp$/i;
    if (!regex.test(email)) {
      return res.send('このドメインのメールアドレスは使用できません');
    }

    try {
      await pool.query(`
        UPDATE user_auth
        SET email = $1, verified_at = NOW()
        WHERE uuid = $2 AND auth_code IS NOT NULL AND code_expire_at > NOW() AND banned = FALSE
      `, [email, uuid]);
      res.send('✅ Googleアカウントが認証されました Minecraftに戻ってください');
    } catch (err) {
      res.send('✖ 失敗しました 認証コードの存在と期限、アカウントのバン状況を確認してください');
    }
  }
);

app.get('/login-failed', (req, res) => {
  res.send(`✖ ログインに失敗しました`);
});

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

app.get('/check/:uuid', async (req, res) => {
  const { uuid } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM user_auth
       WHERE uuid = $1 AND verified_at IS NOT NULL AND banned = FALSE`,
      [uuid]
    );

    if (result.rowCount > 0) {
      return res.send('verified');
    } else {
      try {
        const verifiedCheck = await pool.query(`
          SELECT * FROM user_auth
          WHERE uuid = $1 AND banned = TRUE
        `, [uuid]);

        if (verifiedCheck.rowCount > 0) {
          return res.send('banned');
        }
      } catch (err) {
        console.error(err);
        res.send('error:照会2出来ませんでした');
      }

      const code = generateCode();
      const expire = new Date(Date.now() + 5 * 60 * 1000);

      try {
        await pool.query(`
          INSERT INTO user_auth (uuid, auth_code, code_expire_at, banned)
          VALUES ($1, $2, $3, FALSE)
          ON CONFLICT (uuid) DO UPDATE SET
            auth_code = $2,
            code_expire_at = $3,
            verified_at = NULL,
            email = NULL
        `, [uuid, code, expire]);

        return res.send('pending:' + code);
      } catch (err) {
        console.error(err);
        return res.send('error:認証コードを作成できませんでした');
      }
    }
  } catch (err) {
    console.error('認証チェックエラー:', err);
    res.send('error:照会1出来ませんでした');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
