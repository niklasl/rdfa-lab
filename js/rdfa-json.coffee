# namespace; works both in browser and node
((ns) ->

  ns.extract = (doc, base) ->
    doc or= window.document
    base or= window?.location.href
    top = {}
    if base
      top["@id"] = base
    root = {'@context': {}, '@graph': [top]}
    idMap = {}
    parseElement(doc.documentElement, root, top, null, {}, idMap)
    return {data: root, map: idMap}

  # TODO:
  # - map first occurence of @id and fill in that
  # - profile support (builtin html5 for now)
  # IMP:
  # - about + prop: intermediate current
  # - fix hanging rev
  # - if hanging and prop/rel/rev: inject bnode
  # - interplay of about, property, rel/rev, typeof
  # - xml:lang, xmlns:*
  parseElement = (el, root, current, vocab, hanging, idMap) ->
    attrs = el.attributes
    graph = root['@graph']
    ctxt = new Context(root['@context'], current)

    if attrs?

      if attrs.vocab?.value
        vocab = attrs.vocab.value
        ctxt.update('rdfa', "http://www.w3.org/ns/rdfa#")
        top = graph[0]
        top['rdfa:usesVocabulary'] = vocab
      if attrs.prefix?.value
        pfxs = attrs.prefix.value.split(/:?\s+/)
        for i in [0..pfxs.length] by 2
          pfx = pfxs[i]
          ns = pfxs[i+1]
          ctxt.update(pfx, ns) if attrs.lang?.value
        # TODO: if we reach a non-xml literal here, add to just that?
        ctxt.update('@language', attrs.lang.value)

      # IMP: resolve against base?
      if attrs.resource?
        next = {'@id': attrs.resource.value}
      else if attrs.href?
        next = {'@id': attrs.href.value}
      else if attrs.src?
        next = {'@id': attrs.src.value}
      else if attrs.about?
        next = {'@id': attrs.about.value}

      if not next and attrs.typeof
        next = {}

      predicate = attrs.property?.value or attrs.rel?.value or hanging.rel

      if predicate
        if next
          value = next
        else if attrs.property and attrs.content?
          value = attrs.content.value
        else unless attrs.rel or attrs.rev or hanging.rel or hanging.rev
          # TODO: resolve datatype and match IRI
          if attrs.datatype?.value == 'rdf:XMLLiteral'
            value = el.innerHTML
          else
            value = el.textContent

        if attrs.datatype
          value = {'@value': value}
          if attrs.datatype.value
            value['@datatype'] = attrs.datatype.value

      if attrs.typeof
        types = attrs.typeof.value.split(/\s+/)
        for type in types
          if vocab and type.indexOf(':') == -1
            ctxt.update(type, vocab + type)
        (next or current)['@typeof'] = types

      inlist = (attrs.inlist != undefined) or (hanging.rel and hanging.inlist)

      if value
        if predicate
          for key, i in predicate.split(/\s+/)
            key = storedKey(key, ctxt, vocab)
            if key

              if current[key]
                items = current[key]
                if inlist
                  # IMP: always wrap list obj in array?
                  if items instanceof Array
                    if items[0]['@list']
                      items = items[0]['@list']
                    else
                      l = []
                      items.unshift({'@list': l})
                      items = l
                  else
                    items = items['@list']
              else
                items = []
                current[key] = if inlist then {'@list': items} else items

              item = itemOrRef(value, i, idMap)

              items.push(item)

        rev = attrs.rev?.value or hanging.rev
        if rev
          for key, i in rev.split(/\s+/)
            key = storedKey(key, ctxt, vocab)
            item = itemOrRef(current, true, idMap)
            items = value[key] or= []
            items.push(item)
            unless predicate
              graph.push(value)

        hanging = {}

      else if attrs.rel or attrs.rev
        hanging = {
          rel: attrs.rel?.value,
          rev: attrs.rev?.value,
          inlist: attrs.inlist != undefined
        }

      else if next
        # IMP: defer attach until a predicate for this is used?
        if (sub for sub in el.childNodes when sub.nodeType is 1).length
          graph.push(next)

    for child in el.childNodes
      if child.nodeType is 1
        parseElement(child, root, next or current, vocab, hanging, idMap)
    return

  class Context
    constructor: (@rootCtxt, @current) ->
      @localCtxt = {}
    update: (key, ref) ->
      # IMP: recover from local conflict
      ctxt = @rootCtxt
      if @rootCtxt[key] and @rootCtxt[key] != ref
        ctxt = @localCtxt
        @current['@context'] = @localCtxt
      ctxt[key] = ref

  storedKey = (key, ctxt, vocab) ->
    splitPos = key?.indexOf(':')
    if splitPos > -1
      # IMP: unless ns, find in profile
    else
      if vocab
        iri = vocab + key
        ctxt.update(key, iri)
      else
        # IMP: profile terms
        return null
    return key

  itemOrRef = (value, asRef, idMap) ->
    if asRef and typeof value == 'object' and not value['@value']
      id = value['@id'] or= nextBNode()
      return {'@id': id}
    else
      return value

  bnode = 0
  nextBNode = () -> '_:GEN'+ bnode++

)(exports ? RDFaJSON = {})
