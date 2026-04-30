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
import landingOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/trunksOrders/landing.png'
import deployOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/deploy.png'
import changeSectorOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/changeSector.png'
import clottingOrderDecalUrl from '../../img/orderUnits/ordinaryOrders/clotting.png'
import fireSupIconUrl from '../../img/fireSup.png'

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
    }
    return () => {
      logisticsUnitDecalImgRef.current = {}
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
    },
  }
}
