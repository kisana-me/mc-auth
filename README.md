# mc-auth
spigot pluginのmyauth用web認証システムです

## 初期設定
.envなど、必要な環境変数を定義します

```
docker compose run --rm backend bash
```

```
npm i
```

```
exit
```

```
docker compose down
```

通常起動してDBを作成

```
CREATE TABLE IF NOT EXISTS user_auth (
  uuid TEXT PRIMARY KEY,
  email TEXT,
  auth_code TEXT,
  code_expire_at TIMESTAMP,
  verified_at TIMESTAMP,
  banned BOOLEAN DEFAULT FALSE
);
```

## 起動

```
docker compose up -d --build
```

```
docker compose logs --follow --tail '1000'
```