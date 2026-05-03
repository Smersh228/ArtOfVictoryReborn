const {
  pool,
  isMapAdminUser,
  ADMIN_MAP_USERNAME,
  MAP_STATUS_PENDING,
  MAP_STATUS_APPROVED,
  MAP_STATUS_REJECTED,
  userFromReq,
  hasMapStatusColumn,
  accessDeniedFromMapRow,
} = require('./shared')

async function listMapsHandler(req, res) {
  const hasStatus = await hasMapStatusColumn()
  const user = await userFromReq(req)
  if (!user) {
    return res.json({ maps: [] })
  }
  const editorOnly = req.query.editor === '1' || req.query.editor === 'true'
  try {
    let r
    if (isMapAdminUser(user)) {
      r = await pool.query(
        `SELECT sm.id_map, sm.name, sm.updated_at, ${hasStatus ? 'sm.map_status' : `'approved' AS map_status`}, u.username AS owner_username
         FROM saved_map sm
         LEFT JOIN users u ON u.id = sm.owner_user_id
         ORDER BY updated_at DESC, id_map DESC`,
      )
    } else if (editorOnly) {
      r = await pool.query(
        `SELECT sm.id_map, sm.name, sm.updated_at, ${hasStatus ? 'sm.map_status' : `'approved' AS map_status`}, u.username AS owner_username
         FROM saved_map sm
         LEFT JOIN users u ON u.id = sm.owner_user_id
         WHERE owner_user_id = $1
         ORDER BY updated_at DESC, id_map DESC`,
        [user.id],
      )
    } else {
      if (hasStatus) {
        r = await pool.query(
          `SELECT sm.id_map, sm.name, sm.updated_at, sm.map_status, u.username AS owner_username
           FROM saved_map sm
           LEFT JOIN users u ON u.id = sm.owner_user_id
           WHERE sm.map_status = $1
           ORDER BY sm.updated_at DESC, sm.id_map DESC`,
          [MAP_STATUS_APPROVED],
        )
      } else {
        r = await pool.query(
          `SELECT sm.id_map, sm.name, sm.updated_at, 'approved' AS map_status, u.username AS owner_username
           FROM saved_map sm
           LEFT JOIN users u ON u.id = sm.owner_user_id
           WHERE sm.owner_user_id = $1
              OR (u.username IS NOT NULL AND LOWER(TRIM(u.username::text)) = LOWER($2::text))
           ORDER BY sm.updated_at DESC, sm.id_map DESC`,
          [user.id, ADMIN_MAP_USERNAME],
        )
      }
    }
    return res.json({
      maps: r.rows.map((row) => ({
        id: row.id_map,
        name: row.name,
        updatedAt: row.updated_at,
        moderationStatus: String(row.map_status || MAP_STATUS_PENDING).trim().toLowerCase(),
        ownerUsername: row.owner_username || null,
        canModerate: isMapAdminUser(user),
      })),
    })
  } catch (err) {
    console.error('GET /api/maps:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function getMapHandler(req, res) {
  const hasStatus = await hasMapStatusColumn()
  const user = await userFromReq(req)
  if (!user) return res.status(401).json({ error: 'Войдите, чтобы загрузить карту' })
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
  try {
    const r = await pool.query(
      `SELECT sm.id_map, sm.name, sm.payload, sm.updated_at, sm.owner_user_id, ${hasStatus ? 'sm.map_status' : 'NULL::text AS map_status'},
              u.username AS owner_username
       FROM saved_map sm
       LEFT JOIN users u ON u.id = sm.owner_user_id
       WHERE sm.id_map = $1`,
      [id],
    )
    const row = r.rows[0]
    const gate = accessDeniedFromMapRow(row, user)
    if (gate.denied) return res.status(gate.status).json({ error: gate.error })
    return res.json({
      map: {
        id: row.id_map,
        name: row.name,
        payload: row.payload,
        updatedAt: row.updated_at,
      },
    })
  } catch (err) {
    console.error('GET /api/maps/:id:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function saveMapHandler(req, res) {
  const hasStatus = await hasMapStatusColumn()
  const user = await userFromReq(req)
  if (!user) return res.status(401).json({ error: 'Войдите, чтобы сохранить карту' })

  const { name, payload, id: bodyId } = req.body || {}
  const n = String(name || '').trim()
  if (!n) return res.status(400).json({ error: 'Укажите название карты' })
  if (payload == null || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Нет данных карты (payload)' })
  }
  const json = JSON.stringify(payload)
  const admin = isMapAdminUser(user)
  const wantId = bodyId != null ? Number(bodyId) : NaN

  try {
    if (Number.isFinite(wantId)) {
      const chk = await pool.query(
        `SELECT sm.owner_user_id, u.username AS owner_username
         FROM saved_map sm
         LEFT JOIN users u ON u.id = sm.owner_user_id
         WHERE sm.id_map = $1`,
        [wantId],
      )
      const gate = accessDeniedFromMapRow(chk.rows[0], user)
      if (gate.denied) return res.status(gate.status).json({ error: gate.error })
      const r = await pool.query(
        `UPDATE saved_map SET name = $1, payload = $2::jsonb, updated_at = NOW()
         WHERE id_map = $3
         RETURNING id_map, name`,
        [n, json, wantId],
      )
      return res.status(200).json({
        map: { id: r.rows[0].id_map, name: r.rows[0].name },
      })
    }

    if (admin) {
      const r = hasStatus
        ? await pool.query(
            `INSERT INTO saved_map (name, payload, updated_at, owner_user_id, map_status)
             VALUES ($1, $2::jsonb, NOW(), $3, $4)
             RETURNING id_map, name`,
            [n, json, user.id, MAP_STATUS_APPROVED],
          )
        : await pool.query(
            `INSERT INTO saved_map (name, payload, updated_at, owner_user_id)
             VALUES ($1, $2::jsonb, NOW(), $3)
             RETURNING id_map, name`,
            [n, json, user.id],
          )
      return res.status(201).json({
        map: { id: r.rows[0].id_map, name: r.rows[0].name },
      })
    }

    const existing = await pool.query(
      `SELECT id_map FROM saved_map
       WHERE owner_user_id = $1
       ORDER BY updated_at DESC, id_map DESC
       LIMIT 1`,
      [user.id],
    )
    if (existing.rows.length > 0) {
      const mid = existing.rows[0].id_map
      const r = hasStatus
        ? await pool.query(
            `UPDATE saved_map SET name = $1, payload = $2::jsonb, updated_at = NOW(), map_status = $4
             WHERE id_map = $3 AND owner_user_id = $5
             RETURNING id_map, name`,
            [n, json, mid, MAP_STATUS_PENDING, user.id],
          )
        : await pool.query(
            `UPDATE saved_map SET name = $1, payload = $2::jsonb, updated_at = NOW()
             WHERE id_map = $3 AND owner_user_id = $4
             RETURNING id_map, name`,
            [n, json, mid, user.id],
          )
      return res.status(200).json({
        map: { id: r.rows[0].id_map, name: r.rows[0].name },
      })
    }

    const r = hasStatus
      ? await pool.query(
          `INSERT INTO saved_map (name, payload, updated_at, owner_user_id, map_status)
           VALUES ($1, $2::jsonb, NOW(), $3, $4)
           RETURNING id_map, name`,
          [n, json, user.id, MAP_STATUS_PENDING],
        )
      : await pool.query(
          `INSERT INTO saved_map (name, payload, updated_at, owner_user_id)
           VALUES ($1, $2::jsonb, NOW(), $3)
           RETURNING id_map, name`,
          [n, json, user.id],
        )
    return res.status(201).json({
      map: { id: r.rows[0].id_map, name: r.rows[0].name },
    })
  } catch (err) {
    console.error('POST /api/maps:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function moderateMapHandler(req, res) {
  const hasStatus = await hasMapStatusColumn()
  if (!hasStatus) return res.status(409).json({ error: 'Модерация недоступна: в БД нет колонки map_status' })
  const user = await userFromReq(req)
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' })
  if (!isMapAdminUser(user)) return res.status(403).json({ error: 'Только mstislaw может модерировать карты' })
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
  const action = String(req.body?.action || '').trim().toLowerCase()
  const nextStatus = action === 'approve' ? MAP_STATUS_APPROVED : action === 'reject' ? MAP_STATUS_REJECTED : null
  if (!nextStatus) return res.status(400).json({ error: 'Неверное действие модерации' })
  try {
    const r = await pool.query(
      `UPDATE saved_map
       SET map_status = $1, updated_at = NOW()
       WHERE id_map = $2
       RETURNING id_map`,
      [nextStatus, id],
    )
    if (!r.rows[0]) return res.status(404).json({ error: 'Карта не найдена' })
    return res.json({ ok: true, id, moderationStatus: nextStatus })
  } catch (err) {
    console.error('POST /api/maps/:id/moderate:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function deleteMapHandler(req, res) {
  const user = await userFromReq(req)
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' })
  if (!isMapAdminUser(user)) return res.status(403).json({ error: 'Удаление карт доступно только mstislaw' })
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Неверный id' })
  try {
    const r = await pool.query('DELETE FROM saved_map WHERE id_map = $1 RETURNING id_map', [id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Карта не найдена' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/maps/:id:', err)
    return res.status(500).json({ error: err.message })
  }
}

module.exports = {
  listMapsHandler,
  getMapHandler,
  saveMapHandler,
  moderateMapHandler,
  deleteMapHandler,
}
