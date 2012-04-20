# namespace; works both in browser and node
((ns) ->

  ns.extract = (doc, base) ->
    doc or= window.document
    base or= window?.location.href
    extract = new Extraction(base)
    extract.start(doc.documentElement)
    return extract


  # TODO:
  # - map first occurence of @id and fill in that
  # - profile support (builtin html5 for now)
  # IMP:
  # - about + prop: intermediate current
  # - fix hanging rev
  # - if hanging and prop/rel/rev: inject bnode
  # - interplay of about, property, rel/rev, typeof
  # - xml:lang, xmlns:*
  class Extraction

    constructor: (@base, @profile='html') ->
      @top = {}
      if @base
        @top["@id"] = @base
      @data = {'@context': {}, '@graph': [@top]}
      @idMap = {}
      @bnode_counter = 0

    start: (el) ->
      @parseElement(el, @top, null, {})

    parseElement: (el, current, vocab, hanging) ->
      if el.attributes?
        [next, vocab, hanging] = @nextState(el, current, vocab, hanging)
      for child in el.childNodes
        if child.nodeType is 1
          @parseElement(child, next or current, vocab, hanging)
      return

    nextState: (el, current, vocab, hanging) ->
      attrs = el.attributes

      graph = @data['@graph']
      ctxt = new Context(@data['@context'], current)
      tagName = el.nodeName.toLowerCase()

      if attrs.vocab?.value
        vocab = attrs.vocab.value
        ctxt.update('rdfa', "http://www.w3.org/ns/rdfa#")
        @top['rdfa:usesVocabulary'] = vocab
      if attrs.prefix?.value
        pfxs = attrs.prefix.value.split(/:?\s+/)
        for i in [0..pfxs.length] by 2
          pfx = pfxs[i]
          ns = pfxs[i+1]
          ctxt.update(pfx, ns)
        # TODO: if we reach a non-xml literal here, add to just that?
        ctxt.update('@language', attrs.lang.value) if attrs.lang?.value

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
        if @profile == 'html'
          if tagName == 'head' or tagName == 'body'
            next['@id'] = @top['@id']

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
            value['@type'] = attrs.datatype.value

      if attrs.typeof
        types = attrs.typeof.value.split(/\s+/)
        for type in types
          if vocab and type.indexOf(':') == -1
            ctxt.update(type, vocab + type)
        (next or current)['@type'] = types

      inlist = (attrs.inlist != undefined) or (hanging.rel and hanging.inlist)

      if value
        if predicate
          for key, i in predicate.split(/\s+/)
            key = ctxt.storedKey(key, vocab)
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

              item = @itemOrRef(value, i)

              items.push(item)

        rev = attrs.rev?.value or hanging.rev
        if rev
          for key, i in rev.split(/\s+/)
            key = ctxt.storedKey(key, vocab)
            item = @itemOrRef(current, true)
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

      return [next, vocab, hanging]

    itemOrRef: (value, asRef) ->
      if asRef and typeof value == 'object' and not value['@value']
        id = value['@id'] or= nextBNode()
        return {'@id': id}
      else
        return value

    nextBNode: () ->
      return '_:GEN' + @bnode_counter++


  class Context

    constructor: (@rootCtxt, @current) ->
      @localCtxt = {}

    update: (key, ref) ->
      ctxt = @rootCtxt
      if @rootCtxt[key] and @rootCtxt[key] != ref
        ctxt = @current['@context'] = @localCtxt
        # IMP: recover from local conflict
        #if ctxt[key] then ...
      ctxt[key] = ref

    storedKey: (key, vocab) ->
      splitPos = key?.indexOf(':')
      if splitPos > -1
        # IMP: unless ns, find in profile
      else
        if vocab
          iri = vocab + key
          @update(key, iri)
        else
          # IMP: profile terms
          return null
      return key


)(exports ? RDFaJSON = {})
