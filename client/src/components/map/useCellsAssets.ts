import { useEffect, useRef, useState } from 'react'
import { resolveEditorImageUrl } from '../../api/editorCatalog'
import moveOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/moveOrders/move.png'
import fireOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/fireOrders/fire.png'
import fireHardOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/fireOrders/fireHard.png'
import attackOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/moveOrders/attack.png'
import defenseOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/defenseOrders/defense.png'
import ambushOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/defenseOrders/ambush.png'
import towTrailerDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/trailer.png'
import loadingOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/loading.png'
import getSupDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/getSup.png'
import loadSupDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/LoadSup.png'
import landingOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/landing.png'
import deployOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/deploy.png'
import changeSectorOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/changeSector.png'
import clottingOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/clotting.png'
import fireSupIconUrl from '../../img/fireSup.png'
import airDepartureDecalUrl from '../../img/propertis/И16.png'
import fireAirGunDecalUrl from '../../img/propertis/fireAirGun.png'
import { EDITOR_BATTLE_ORDER_DEFS } from '../../game/battleOrderIcons'
import { WIRE_SPRITE_URL } from '../../game/cellWireEdges'
import {
  DOT_SPRITE_URL,
  STORAGE_SPRITE_URL,
  ANTITANK_SPRITE_URL,
  TRENCH_SPRITE_URL,
  PONTON_SPRITE_URL,
} from '../../game/editorMapFortifications'
import { SMOKE_SPRITE_URL } from '../../game/cellSmoke'

export interface CachedImageState {
  ready: HTMLImageElement | null
  pending: boolean
  noUrl: boolean
}

interface ShootOrderIcons {
  fire?: HTMLImageElement
  fireHard?: HTMLImageElement
  attack?: HTMLImageElement
}

interface LogisticsOrderIcons {
  tow?: HTMLImageElement
  loading?: HTMLImageElement
  getSup?: HTMLImageElement
  loadingSup?: HTMLImageElement
}

export function useCellsAssets() {
  const moveDecalImgRef = useRef<HTMLImageElement | null>(null)
  const defendOrderDecalImgRef = useRef<HTMLImageElement | null>(null)
  const ambushOrderDecalImgRef = useRef<HTMLImageElement | null>(null)
  const shootOrderDecalImgRef = useRef<ShootOrderIcons>({})
  const logisticsUnitDecalImgRef = useRef<LogisticsOrderIcons>({})
  const unloadCellDecalImgRef = useRef<HTMLImageElement | null>(null)
  const deployOrderDecalImgRef = useRef<HTMLImageElement | null>(null)
  const changeSectorOrderDecalImgRef = useRef<HTMLImageElement | null>(null)
  const clottingOrderDecalImgRef = useRef<HTMLImageElement | null>(null)
  const fireSupIconImgRef = useRef<HTMLImageElement | null>(null)
  /** Иконки авиаприказов на целевом гексе (превью из панели «Авиаподдержка»). */
  const airMissionOrderDecalImgRef = useRef<Record<string, HTMLImageElement>>({})
  /** Иконка точки вылета авиации на карте. */
  const airDepartureDecalImgRef = useRef<HTMLImageElement | null>(null)
  /** Иконка обстрела ПВО (сектор артиллерии по авиации) в отчёте боя. */
  const fireAirGunDecalImgRef = useRef<HTMLImageElement | null>(null)
  const wireEdgeImgRef = useRef<HTMLImageElement | null>(null)
  const trenchImgRef = useRef<HTMLImageElement | null>(null)
  const antiTankImgRef = useRef<HTMLImageElement | null>(null)
  const dotImgRef = useRef<HTMLImageElement | null>(null)
  const storageImgRef = useRef<HTMLImageElement | null>(null)
  const pontonImgRef = useRef<HTMLImageElement | null>(null)
  const smokeImgRef = useRef<HTMLImageElement | null>(null)
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({})
  const [textureVersion, setTextureVersion] = useState(0)
  const bumpTextures = () => setTextureVersion((v) => v + 1)

  const buildImage = (url: string): HTMLImageElement => {
    const img = new Image()
    img.onload = () => bumpTextures()
    img.onerror = () => bumpTextures()
    img.src = url
    return img
  }

  useEffect(() => {
    moveDecalImgRef.current = buildImage(moveOrderDecalUrl)
    return () => {
      moveDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    defendOrderDecalImgRef.current = buildImage(defenseOrderDecalUrl)
    return () => {
      defendOrderDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    ambushOrderDecalImgRef.current = buildImage(ambushOrderDecalUrl)
    return () => {
      ambushOrderDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    unloadCellDecalImgRef.current = buildImage(landingOrderDecalUrl)
    return () => {
      unloadCellDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    deployOrderDecalImgRef.current = buildImage(deployOrderDecalUrl)
    return () => {
      deployOrderDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    changeSectorOrderDecalImgRef.current = buildImage(changeSectorOrderDecalUrl)
    return () => {
      changeSectorOrderDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    clottingOrderDecalImgRef.current = buildImage(clottingOrderDecalUrl)
    return () => {
      clottingOrderDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    fireSupIconImgRef.current = buildImage(fireSupIconUrl)
    return () => {
      fireSupIconImgRef.current = null
    }
  }, [])

  useEffect(() => {
    shootOrderDecalImgRef.current = {
      fire: buildImage(fireOrderDecalUrl),
      fireHard: buildImage(fireHardOrderDecalUrl),
      attack: buildImage(attackOrderDecalUrl),
    }
    return () => {
      shootOrderDecalImgRef.current = {}
    }
  }, [])

  useEffect(() => {
    logisticsUnitDecalImgRef.current = {
      tow: buildImage(towTrailerDecalUrl),
      loading: buildImage(loadingOrderDecalUrl),
      getSup: buildImage(getSupDecalUrl),
      loadingSup: buildImage(loadSupDecalUrl),
    }
    return () => {
      logisticsUnitDecalImgRef.current = {}
    }
  }, [])

  useEffect(() => {
    airDepartureDecalImgRef.current = buildImage(airDepartureDecalUrl)
    return () => {
      airDepartureDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    fireAirGunDecalImgRef.current = buildImage(fireAirGunDecalUrl)
    return () => {
      fireAirGunDecalImgRef.current = null
    }
  }, [])

  useEffect(() => {
    wireEdgeImgRef.current = buildImage(WIRE_SPRITE_URL)
    return () => {
      wireEdgeImgRef.current = null
    }
  }, [])

  useEffect(() => {
    trenchImgRef.current = buildImage(TRENCH_SPRITE_URL)
    return () => {
      trenchImgRef.current = null
    }
  }, [])

  useEffect(() => {
    antiTankImgRef.current = buildImage(ANTITANK_SPRITE_URL)
    return () => {
      antiTankImgRef.current = null
    }
  }, [])

  useEffect(() => {
    dotImgRef.current = buildImage(DOT_SPRITE_URL)
    return () => {
      dotImgRef.current = null
    }
  }, [])

  useEffect(() => {
    storageImgRef.current = buildImage(STORAGE_SPRITE_URL)
    return () => {
      storageImgRef.current = null
    }
  }, [])

  useEffect(() => {
    pontonImgRef.current = buildImage(PONTON_SPRITE_URL)
    return () => {
      pontonImgRef.current = null
    }
  }, [])

  useEffect(() => {
    smokeImgRef.current = buildImage(SMOKE_SPRITE_URL)
    return () => {
      smokeImgRef.current = null
    }
  }, [])

  useEffect(() => {
    const next: Record<string, HTMLImageElement> = {}
    for (const d of EDITOR_BATTLE_ORDER_DEFS) {
      if (d.editorCategory !== 'aviation' || !d.icon) continue
      next[d.order_key] = buildImage(d.icon)
    }
    airMissionOrderDecalImgRef.current = next
    return () => {
      airMissionOrderDecalImgRef.current = {}
    }
  }, [])

  const resolveEditorCachedImage = (path: string | null | undefined): CachedImageState => {
    const url = resolveEditorImageUrl(path)
    if (!url) return { ready: null, pending: false, noUrl: true }
    const cache = imageCacheRef.current
    let img = cache[url]
    if (img?.complete && img.naturalWidth) return { ready: img, pending: false, noUrl: false }
    if (!img) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => bumpTextures()
      img.onerror = () => bumpTextures()
      img.src = url
      cache[url] = img
      return { ready: null, pending: true, noUrl: false }
    }
    if (!img.complete) return { ready: null, pending: true, noUrl: false }
    return { ready: null, pending: false, noUrl: false }
  }

  const getTexture = (path: string | null | undefined): HTMLImageElement | null => {
    const s = resolveEditorCachedImage(path)
    return s.ready
  }

  return {
    textureVersion,
    resolveEditorCachedImage,
    getTexture,
    refs: {
      moveDecalImgRef,
      defendOrderDecalImgRef,
      ambushOrderDecalImgRef,
      shootOrderDecalImgRef,
      logisticsUnitDecalImgRef,
      unloadCellDecalImgRef,
      deployOrderDecalImgRef,
      changeSectorOrderDecalImgRef,
      clottingOrderDecalImgRef,
      fireSupIconImgRef,
      airMissionOrderDecalImgRef,
      airDepartureDecalImgRef,
      fireAirGunDecalImgRef,
      wireEdgeImgRef,
      trenchImgRef,
      antiTankImgRef,
      dotImgRef,
      storageImgRef,
      pontonImgRef,
      smokeImgRef,
    },
  }
}
