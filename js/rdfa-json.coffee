# module namespace; works both in browser and node
((module) ->

  module.extract = (doc, base) ->
    doc or= window.document
    extract = new module.Extract(doc, base)
    extract.run()
    return extract


  # TODO:
  # - modularize and complete profile support (default context etc.)
  # - resolve datatype and match IRI for rdf:XMLLiteral
  # - xml:lang, xmlns:*
  # - more flat (add first occurrence of @id to graph and fill in that)
  # NEXT:
  # - attach (non-enumerable) function for getSource (for an RDFa:ish API)
  #   - source as map of property -> subjectElement, objectElement (no hanging for now)
  # NEXT:
  # - fix interplay of about, property, rel/rev, typeof
  # - fix hanging rev
  # - if hanging and prop/rel/rev: inject bnode
  # - determine strategy for "pathological" input (e.g. redef. prefixes)
  # DEFERRED:
  # - flag to build context and keep compact or produce expanded json-ld?
  # - for compaction with custom context: feed into an JSON-LD API impl.
  class module.Extract

    constructor: (@doc, @base=@doc.documentURI) ->
      @profile = 'html'
      @defaultCtxt = module.contexts[@profile]
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
      #@idMap = {}

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

      #if attrs.about? and (attrs.property or attrs.rel or attrs.rev)
      #  parent = current
      #  current = {'@id': @resolve(attrs.about.value)}
      #  @graph.push(current)

      ctxt = new Context(@defaultCtxt, @data['@context'], current)
      tagName = el.nodeName.toLowerCase()

      if attrs.vocab?.value
        vocab = attrs.vocab.value
        ctxt.update('rdfa', RDFA_IRI)
        @top['rdfa:usesVocabulary'] = {'@id': vocab}
      if attrs.prefix?.value
        pfxs = attrs.prefix.value.replace(/^\s+|\s+$/g, "").split(/:?\s+/)
        for i in [0...pfxs.length] by 2
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
      else if attrs.about? #and not parent
        next = {'@id': @resolve(attrs.about.value)}

      if not next and attrs.typeof
        if @profile == 'html' and tagName == 'head' or tagName == 'body'
          next = {'@id': @top['@id']}
        else
          next = {}

      # TODO: unconflate property, rel and hanging logic

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
            ctxt.update('xsd', XSD_IRI)
            datatype = if value.indexOf('T') > -1
              'xsd:dateTime'
            else
              'xsd:date'
        if not value and not (attrs.rel or attrs.rev or hanging.rel or hanging.rev)
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

      if not next #or next['@id'] == current['@id'] # don't detach as new?
        next = current

      return [next, vocab, hanging]

    resolve: (ref) ->
      @resolver.href = ref
      return @resolver.href

    itemOrRef: (value, asRef) ->
      if asRef and typeof value == 'object' and not value['@value']
        id = value['@id'] or= @nextBNode()
        return {'@id': id}
      else
        return value

    nextBNode: () ->
      return '_:GEN' + @bnodeCounter++


  class Context

    constructor: (@defaultCtxt, @rootCtxt, @current) ->
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

  module.contexts =
    html: {
      "grddl": "http://www.w3.org/2003/g/data-view#",
      "ma": "http://www.w3.org/ns/ma-ont#",
      "owl": "http://www.w3.org/2002/07/owl#",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfa": "http://www.w3.org/ns/rdfa#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "rif": "http://www.w3.org/2007/rif#",
      "skos": "http://www.w3.org/2004/02/skos/core#",
      "skosxl": "http://www.w3.org/2008/05/skos-xl#",
      "wdr": "http://www.w3.org/2007/05/powder#",
      "void": "http://rdfs.org/ns/void#",
      "wdrs": "http://www.w3.org/2007/05/powder-s#",
      "xhv": "http://www.w3.org/1999/xhtml/vocab#",
      "xml": "http://www.w3.org/XML/1998/namespace",
      "xsd": "http://www.w3.org/2001/XMLSchema#",
      "cc": "http://creativecommons.org/ns#",
      "ctag": "http://commontag.org/ns#",
      "dc": "http://purl.org/dc/terms/",
      "dcterms": "http://purl.org/dc/terms/",
      "foaf": "http://xmlns.com/foaf/0.1/",
      "gr": "http://purl.org/goodrelations/v1#",
      "ical": "http://www.w3.org/2002/12/cal/icaltzd#",
      "og": "http://ogp.me/ns#",
      "rev": "http://purl.org/stuff/rev#",
      "sioc": "http://rdfs.org/sioc/ns#",
      "v": "http://rdf.data-vocabulary.org/#",
      "vcard": "http://www.w3.org/2006/vcard/ns#",
      "schema": "http://schema.org/",
      "describedby": "http://www.w3.org/2007/05/powder-s#describedby",
      "license": "http://www.w3.org/1999/xhtml/vocab#license",
      "role": "http://www.w3.org/1999/xhtml/vocab#role"
    }

  RDF_IRI = module.contexts.html.rdf
  XSD_IRI = module.contexts.html.xsd
  RDFA_IRI = module.contexts.html.rdfa

)(exports ? RDFaJSON = {})
