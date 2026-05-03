/** @type {Map<number, { id: number, name: string, map: string, maxPlayers: number, hostKey: string, battleStartedAt: number | null, members: Array<{ key: string, faction: string, ready: boolean }>, createdAt: number }>} */
const rooms = new Map()
let nextRoomId = 1

function allocRoomId() {
  const id = nextRoomId
  nextRoomId += 1
  return id
}

module.exports = {
  rooms,
  allocRoomId,
}
