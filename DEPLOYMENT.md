# 🚀 LiveChat Pro - GitHub & Netlify Telepítési Útmutató

Ez a dokumentum lépésről lépésre bemutatja, hogyan töltheted fel a **LiveChat Pro** projektedet a GitHubra, és hogyan hosztolhatod a Netlify-n egyedi saját domain névvel.

---

## 1. 📂 GitHub Feltöltés (3 Lépés)

A Git repozitórium már elő van készítve és fel van készítve az első commit-tal!

Nyiss egy terminált a projekt mappájában (`c:\laragon\www\livechatpro`), és futtasd a következő parancsokat:

1. Hozz létre egy új üres repozitóriumot a [GitHub.com](https://github.com/new) oldalon **`livechatpro`** néven.
2. Csatlakoztasd a helyi kódodat a GitHubhoz (cseréld ki a `FELHASZNÁLÓNEVED` szót a saját GitHub felhasználónevedre):

```bash
git remote add origin https://github.com/FELHASZNÁLÓNEVED/livechatpro.git
git branch -M main
git push -u origin main
```

---

## 2. 🌐 Netlify Telepítés (Front-End & Widget)

1. Jelentkezz be a [Netlify Dashboard](https://app.netlify.com) felületén.
2. Kattints az **"Add new site"** ➔ **"Import from an existing project"** gombra.
3. Válaszd ki a **GitHub** szolgáltatót, majd válaszd ki a `livechatpro` repozitóriumot.
4. A build beállítások automatikusan beolvasásra kerülnek a `netlify.toml` fájlból:
   - **Publish directory**: `public`
5. Kattints a **"Deploy livechatpro"** gombra!

---

## 3. 🏷️ Saját Domain Név Beállítása Netlify-n

1. A Netlify irányítópultján menj a **Domain management** menüpontba.
2. Kattints az **"Add domain alias"** vagy **"Add custom domain"** gombra.
3. Írd be a saját domain nevedet (pl. `livechatpro.hu` vagy `chat.sajátcéged.hu`).
4. A domain regisztrátorodnál (pl. Rackhost, DotRoll, Cloudflare, GoDaddy) állítsd be a DNS rekordot:
   - **CNAME rekord**: `chat.sajátcéged.hu` ➔ `saját-app-név.netlify.app`
   - Vagy **A rekord**: `@` ➔ Netlify által megadott IP cím (`75.2.60.5`).
5. A Netlify 1 kattintással automatikusan kiállítja az **ingyenes HTTPS / SSL tanúsítványt (Let's Encrypt)**!

---

## 4. ⚡ Valós Idejű Node.js Backend (Render / Railway / VPS)

A valós idejű Socket.IO kommunikációhoz és a mentett beszélgetésekhez futnia kell a `server.js` Node.js szervernek:

1. Nyisd meg a [Render.com](https://render.com) oldalt.
2. Kattints a **New +** ➔ **Web Service** lehetőségre.
3. Csatlakoztasd a GitHub `livechatpro` repozitóriumodat.
4. Beállítások:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. A Render automatikusan ad egy ingyenes HTTPS szerver címet (pl. `https://livechatpro-backend.onrender.com`).

---

## 📌 Beágyazó Kód Bármely Weboldalra

Miután élesítetted a weboldalt a saját domain neveden, illeszd be ezt a 1 soros JavaScript kódot bármely weboldal HTML forrásába:

```html
<!-- LiveChat Pro Beágyazás -->
<script src="https://livechatpro.netlify.app/widget.js" data-server="https://livechatpro-backend.onrender.com"></script>
```
