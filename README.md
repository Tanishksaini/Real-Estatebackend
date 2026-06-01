## Property Backend (Node.js + MongoDB)

### Setup

- **Install**: `npm install`
- **Configure env**: update `.env` (see `.env.example`)
- **Run**:
  - Dev: `npm run dev`
  - Prod: `npm start`

### Auth (Email + Password + JWT)

- `POST /api/auth/signup`
  - Body: `{ "name?": "Tanis", "email": "a@b.com", "password": "secret123", "phone?": "..." }`
- `POST /api/auth/login`
  - Body: `{ "email": "a@b.com", "password": "secret123" }`

Use header: `Authorization: Bearer <token>`

### Me / Dashboard APIs

- `GET /api/me` (profile)
- `PATCH /api/me` (update profile)
- `DELETE /api/me` (delete account)
- `GET /api/me/favorites`
- `GET /api/me/recently-viewed`
- `GET /api/me/contacted`
- `GET /api/me/notifications`
- `POST /api/me/notifications/:id/read`

### Properties

- **Public search/list**: `GET /api/properties`
  - Filters: `q,type,city,localArea,verifiedOnly,minPrice,maxPrice,minArea,maxArea,status`
  - Nearby: `lat,lng,radiusKm` (use `sort=nearest`)
  - Paging: `page,limit`
  - Sort: `latest | nearest | lowestPrice | highestPrice`

- **Public detail**: `GET /api/properties/:id`
- **Create** (auth): `POST /api/properties`
- **Update** (owner): `PATCH /api/properties/:id`
- **Delete** (owner): `DELETE /api/properties/:id`
- **Upload media/docs** (owner): `POST /api/properties/:id/media` (multipart)
  - Fields: `photos[]`, `videos[]`, `registry`, `saleDeed`, `taxReceipt`
- **Mark sold** (owner): `POST /api/properties/:id/mark-sold`
- **Favorite toggle** (auth): `POST /api/properties/:id/favorite`
- **Contact tracking** (auth): `POST /api/properties/:id/contact` body: `{ "method": "call|whatsapp|email" }`
- **Share tracking**: `POST /api/properties/:id/share`
- **Similar properties**: `GET /api/properties/:id/similar`
- **Seller info**: `GET /api/properties/:id/seller`

### Health

- `GET /health`

