# namespace; works both in browser and node
((ns) ->

  ns.extract = (doc, base) ->
    doc or= window.document
    extract = new ns.Extract(doc, base)
    extract.run()
    return extract


  # TODO:
  # - fix interplay of about, property, rel/rev, typeof
  # - fix hanging rev
  # - modularize and complete profile support (default context etc.)
  # then:
  # - map first occurence of @id and fill in that
  # - if hanging and prop/rel/rev: inject bnode
  # - xml:lang, xmlns:*
  class ns.Extract

    constructor: (@doc, @base=@doc.documentURI) ->
      @profile = 'html'
      if @profile == 'html'
        baseEl = @doc.getElementsByTagName('base')[0]
        if baseEl then @base = baseEl.href
      @top = {}
      if @base
        @top["@id"] = @base
      @graph = [@top]
      @data = {'@context': {}, '@graph': @graph}
      @resolver = @doc.createElement('a')
      @bnodeCounter = 0
      @idMap = {}

    toJSON: () ->
      return @data

    run: () ->
      @parseElement(@doc.documentElement, @top, null, {})
      return

    parseElement: (el, current, vocab, hanging) ->
      if el.attributes?
        [next, vocab, hanging] = @nextState(el, current, vocab, hanging)
      for child in el.childNodes
        if child.nodeType is 1
          @parseElement(child, next, vocab, hanging)
      return

    nextState: (el, current, vocab, hanging) ->
      attrs = el.attributes

      ctxt = new Context(@data['@context'], current)
      tagName = el.nodeName.toLowerCase()

      if attrs.vocab?.value
        vocab = attrs.vocab.value
        ctxt.update('rdfa', "http://www.w3.org/ns/rdfa#")
        @top['rdfa:usesVocabulary'] = vocab
      if attrs.prefix?.value
        pfxs = attrs.prefix.value.replace(/^\s+|\s+$/g, "").split(/:?\s+/)
        for i in [0..pfxs.length] by 2
          pfx = pfxs[i]
          ns = pfxs[i+1]
          ctxt.update(pfx, ns)
        # IMP: if we reach a non-xml literal here, add to just that?
        ctxt.update('@language', attrs.lang.value) if attrs.lang?.value

      if attrs.resource?
        next = {'@id': @resolve(attrs.resource.value)}
      else if attrs.href?
        next = {'@id': el.href}
      else if attrs.src?
        next = {'@id': @resolve(attrs.src.value)}
      else if attrs.about?
        next = {'@id': @resolve(attrs.about.value)}

      if not next and attrs.typeof
        if @profile == 'html' and tagName == 'head' or tagName == 'body'
          next = {'@id': @top['@id']}
        else
          next = {}

      predicate = attrs.property?.value or attrs.rel?.value or hanging.rel

      if predicate
        datatype = attrs.datatype?.value
        if next
          value = next
        else if attrs.property
          if attrs.content?
            value = attrs.content.value
          else if @profile == 'html' and tagName == 'time'
            if attrs.datetime?
              value = attrs.datetime.value
            else
              value = el.textContent
            ctxt.update('xsd', "http://www.w3.org/2001/XMLSchema#")
            datatype = if value.indexOf('T') > -1
              'xsd:dateTime'
            else
              'xsd:date'
        if not value and not (attrs.rel or attrs.rev or hanging.rel or hanging.rev)
          # TODO: resolve datatype and match IRI
          if attrs.datatype?.value == 'rdf:XMLLiteral'
            value = el.innerHTML
          else
            value = el.textContent

        if datatype?
          value = {'@value': value}
          if datatype
            value['@type'] = datatype

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
              @graph.push(value)

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
          @graph.push(next)

      return [next or current, vocab, hanging]

    resolve: (ref) ->
      @resolver.href = ref
      return @resolver.href

    itemOrRef: (value, asRef) ->
      if asRef and typeof value == 'object' and not value['@value']
        id = value['@id'] or= nextBNode()
        return {'@id': id}
      else
        return value

    nextBNode: () ->
      return '_:GEN' + @bnodeCounter++


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
