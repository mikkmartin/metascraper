'use strict'

const { isEmpty, first, toNumber, chain, get, orderBy } = require('lodash')
const { URL } = require('url')
const got = require('got')

const {
  absoluteUrl,
  logo,
  url: urlFn,
  toRule
} = require('@metascraper/helpers')

const SIZE_REGEX_BY_X = /\d+x\d+/

const toUrl = toRule(urlFn)

const toSize = (input, url) => {
  if (isEmpty(input)) return

  const [verticalSize, horizontalSize] = chain(input)
    .replace(/×/g, 'x')
    .split(' ')
    .first()
    .split('x')
    .value()

  const height = toNumber(verticalSize) || 0
  const width = toNumber(horizontalSize) || 0

  return {
    height,
    width,
    square: width === height,
    priority: toSize.priority({ url, width: width || 1 })
  }
}

toSize.fallback = url => ({
  width: 0,
  height: 0,
  square: true,
  priority: toSize.priority({ url, width: 1 })
})

toSize.priority = ({ url, width }) => {
  // lets consider apple icon is beauty
  if (url.includes('apple')) return 5 * width
  if (url.includes('android')) return 5 * width
  if (url.endsWith('png')) return 5 * width
  if (url.endsWith('jpg') || url.endsWith('jpeg')) return 4 * width
  if (url.endsWith('svg')) return 3 * width
  if (url.endsWith('ico')) return 2 * width
  return 1 * width
}

const getSize = (url, sizes) =>
  toSize(sizes, url) ||
  toSize(first(url.match(SIZE_REGEX_BY_X)), url) ||
  toSize.fallback(url)

const getDomNodeSizes = (domNodes, attr) =>
  chain(domNodes)
    .reduce((acc, domNode) => {
      const url = domNode.attribs[attr]
      if (!url) return acc
      return [
        ...acc,
        {
          ...domNode.attribs,
          url,
          size: getSize(url, domNode.attribs.sizes)
        }
      ]
    }, [])
    .value()

const getSizes = ($, collection) =>
  chain(collection)
    .reduce((acc, { tag, attr }) => {
      const domNodes = $(tag).get()
      return [...acc, ...getDomNodeSizes(domNodes, attr)]
    }, [])
    .value()

const sizeSelectors = [
  { tag: 'link[rel*="icon" i]', attr: 'href' }, // apple-icon, // fluid-icon
  { tag: 'meta[name*="msapplication" i]', attr: 'content' } // Windows 8, Internet Explorer 11 Tiles
]

const pickBiggerSize = sizes => {
  const sorted = sizes.reduce(
    (acc, item) => {
      acc[item.size.square ? 'square' : 'nonSquare'].push(item)
      return acc
    },
    { square: [], nonSquare: [] }
  )

  return (
    first(pickBiggerSize.sortBySize(sorted.square)) ||
    first(pickBiggerSize.sortBySize(sorted.nonSquare))
  )
}

pickBiggerSize.sortBySize = collection =>
  orderBy(collection, ['size.priority'], ['desc'])

const DEFAULT_GOT_OPTS = {
  timeout: 3000
}

const createGetLogo = gotOpts => async url => {
  const logoUrl = absoluteUrl(new URL(url).origin, 'favicon.ico')
  try {
    await got.head(logoUrl, {
      ...DEFAULT_GOT_OPTS,
      ...gotOpts
    })
    return logo(logoUrl)
  } catch (_) {}
}

/**
 * Rules.
 */
module.exports = ({ gotOpts, pickFn = pickBiggerSize } = {}) => {
  const getLogo = createGetLogo(gotOpts)

  return {
    logo: [
      toUrl($ => {
        const sizes = getSizes($, sizeSelectors)
        const size = pickFn(sizes, pickBiggerSize)
        return get(size, 'url')
      }),
      ({ url }) => getLogo(url)
    ]
  }
}
