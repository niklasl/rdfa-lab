((exports) ->

  RDF_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  RDF_XML_LITERAL = RDF_IRI + 'XMLLiteral'
  RDFA_USES_VOCAB = "http://www.w3.org/ns/rdfa#usesVocabulary"


  getNextBNode = null

  extract = (doc, base, profile='html') ->
    getNextBNode = bnodeCounter()
    state = init(doc, base, profile)
    #builder = new Builder()
    builder.start(state)
    walk(doc.documentElement, state)
    return builder.complete(state)

  init = (doc, base, profile) ->
    resolver = doc.createElement('a')
    resolveURI = (ref) ->
      resolver.href = ref
      return resolver.href
    if doc.getElementsByTagName('base').length
      base = resolveURI('')
    state = new State(base, profile, resolveURI)
    return state

  walk = (el, state) ->
    if el.attributes.length
      #desc = getDescription(el, state)
      desc = new Description(el, state) # el.rdfa
      change = builder.visit(desc, state)
      if change
        state = state.createSubState(desc, change.subject, change.incomplete)
    for child in el.childNodes
      if child.nodeType is 1
        walk(child, state)


  builder =

    start: (state) ->
      state.result = {all: {}}
      getOrCreateNode(state.result, state.context.base)
      return null

    visit: (desc, state) ->
      result = state.result

      if desc.vocab
        baseObj = getOrCreateNode(result, desc.context.base)
        addPropToObj(baseObj, RDFA_USES_VOCAB, desc.vocab)

      s = desc.subject or desc.parentSubject
      currentNode = getOrCreateNode(result, s)
      localNode = getOrCreateNode(result, desc.subject or desc.resource)

      rels = desc.linkProperties
      revs = desc.reverseLinkProperties
      props = desc.contentProperties
      inlist = desc.inlist
      incomplete = desc.parentIncomplete
      hasLinks = rels.length or revs.length

      unless desc.subject or hasLinks or props.length
        return {subject: s, incomplete: incomplete}

      if incomplete
        completedNode = getOrCreateNode(result, incomplete.subject)
        if desc.subject
          completingNode = localNode
        else
          completingNode = getOrCreateNode(result, incomplete.incompleteSubject)
          currentNode = completingNode
        if completingNode
          adder = if incomplete.inlist then addToPropListToObj else addPropToObj
          for rel in incomplete.linkProperties
            adder(completedNode, rel, {'@id': completingNode['@id']})
          for rev in incomplete.reverseLinkProperties
            adder(completingNode, rev, {'@id': completedNode['@id']})
          incomplete = null

      if hasLinks and not desc.resource
        incomplete = {
          linkProperties: rels, reverseLinkProperties: revs, inlist: inlist,
          subject: s, incompleteSubject: getNextBNode()}

      types = desc.types
      if types
        for type in types
          addPropToObj(localNode, "@type", type)

      adder = if inlist then addToPropListToObj else addPropToObj

      o = desc.resource
      oNode = null
      nestedNode = currentNode
      if o
        oNode = getOrCreateNode(result, o)
        if desc.scoped
          nestedNode = oNode
        oref = {"@id": o}
        for rel in rels
          adder(currentNode, rel, oref)
        if revs.length
          sref = {"@id": s}
          for rev in revs
            adder(oNode, rev, sref)

      content = desc.content
      if content
        for prop in props
          literal = makeLiteral(content, desc.datatype, desc.lang)
          adder(currentNode, prop, literal)

      return {subject: nestedNode['@id'], incomplete: incomplete}

    complete: (state) ->
      items = []
      for s, obj of state.result.all
        add = true
        if obj["@id"]
          add = false
          for key of obj
            if key != "@id"
              add = true
              break
        if add
          items.push(obj)
      items
      #{'@context': state.result.context, '@graph': items}


  getOrCreateNode = (result, id) ->
      obj = result.all[id]
      unless obj
        obj = result.all[id] = {"@id": id}
      obj

  addPropToObj = (obj, prop, value) ->
    values = obj[prop]
    unless values
      values = obj[prop] = []
    else unless values.push
      values = obj[prop] = [values]
    values.push(value)

  addToPropListToObj = (obj, prop, value) ->
    values = obj[prop]
    # TODO: list in Array or direct object (latter prevents sets of mixed refs+lists)
    if values instanceof Array
      if values[0]['@list']
        values = values[0]['@list']
      else
        l = []
        values.unshift({'@list': l})
        values = l
    else if values
      values = values['@list']
    else
      values = []
      obj[prop] = {"@list": values}
    values.push(value)

  makeLiteral = (value, datatype, lang) ->
    if datatype # and datatype isnt XSD_LANGLITERAL
      {"@value": value, "@type": datatype}
    else if lang
      {"@value": value, "@language": lang}
    else
      value


  class State
    constructor: (base, profile, resolveURI) ->
      @context = new Context(resolveURI, profile, base, null, contexts[profile])
      @lang = null
      @incomplete = null
      @subject = base

    createSubState: (desc, subject, incomplete) ->
      subState = inherit(this)
      subState.context = desc.context
      subState.lang = desc.lang
      subState.subject = subject
      subState.incomplete = incomplete
      return subState


  class Context
    constructor: (@resolveURI, @profile, @base, @vocab=null, @prefixes={}) ->

    createSubContext: (base, vocab, prefixes) ->
      base ?= @base
      vocab ?= @vocab
      subPrefixes = inherit(@prefixes)
      for pfx, iri of prefixes
        subPrefixes[pfx] = iri
      return new Context(@resolveURI, @profile, base, vocab, subPrefixes)

    expandTermOrCurieOrIRI: (expr) ->
      iri = @prefixes[expr]
      if iri
        return iri
      else if expr.indexOf(":") is -1
        if @vocab
          return @vocab + expr
        else
          return null
      else
        return @expandCurieOrIRI(expr)

    expandCurieOrIRI: (expr) ->
      safeCurie = false
      if expr.match(/^\[(.+)]$/)
        expr = RegExp.$1
        safeCurie = true
      i = expr.indexOf(':')
      if i is -1
        # TODO: if safeCurie then error and return null
        return expr
      pfx = expr.substring(0, i)
      term = expr.substring(i + 1)
      if pfx is '_'
        return expr
      if term.slice(0, 2) is "//"
        return expr
      ns = @prefixes[pfx]
      if ns
        return ns + term
      return expr

    expandAndResolve: (curieOrIri) ->
      # TODO: expandOrResolve?
      iri = @expandCurieOrIRI(curieOrIri)
      return iri if iri[0] is '_'
      @resolveURI(iri)


  ##
  # A representation of the interpreted description formed by the logical
  # attributes of an element. Use this to produce triples.
  class Description
    constructor: (el, state) ->
      # TODO: state or= computeState(el)
      @parentSubject = state.subject
      @parentIncomplete = state.incomplete

      data = new ElementData(el, state.context)
      @errors = data.errors
      @lang = data.getLang() ? state.lang
      @vocab = data.getVocab()
      @context = data.context

      @types = data.getTypes()

      props = data.getProperties()
      resource = data.getResource()
      rels = data.getRels()
      revs = data.getRevs()
      propsAsLinks = !!(props and (not (rels or revs)) and (resource or @types))

      @contentProperties = if (props and not propsAsLinks) then props else []
      @linkProperties = if rels then rels else if propsAsLinks then props else []
      @reverseLinkProperties = revs or []
      @inlist = data.isInlist()

      if resource
        @resource = resource
      else if @types and (rels or props) # and not content attr
        @resource = getNextBNode()

      @scoped = @resource and not propsAsLinks or @types

      @subject = data.getAbout() or @getResourceAsSubject()

      # TODO: .. and not content attr and @resource
      if @contentProperties
        lit = data.getLiteral()
        if lit
          @content = lit.value
          @datatype = lit.datatype

    getResourceAsSubject: ->
      links = @linkProperties.length or @reverseLinkProperties.length
      if @resource and not links
        return @resource
      else if @types and not (@contentProperties.length or links) # TODO: redundancy?
        return getNextBNode()


  ##
  # A representation of the logical data expressed by an element. This takes
  # context mappings into account, but does not interpret the attribute
  # interplay and generation of triples.
  class ElementData
    constructor: (@el, parentContext) ->
      @attrs = @el.attributes
      @tagName = @el.nodeName.toLowerCase()
      @errors = []
      @context = parentContext.createSubContext(
        @getBase(), @getVocab(), @getPrefixes())

    getBase: ->
      null # xml:base if XML-based profile

    getLang: ->
      @attrs['xml:lang']?.value or @attrs.lang?.value

    getVocab: ->
      @attrs.vocab?.value

    getPrefixes: ->
      prefixes = @getNamespaces()
      val = @attrs.prefix?.value
      return prefixes unless val
      pfxs = val.replace(/^\s+|\s+$/g, "").split(/:?\s+/)
      for i in [0...pfxs.length] by 2
        pfx = pfxs[i]
        ns = pfxs[i+1]
        prefixes[pfx] = ns
      prefixes

    getNamespaces: ->
      prefixes = {}
      for attr in @attrs
        if attr.name.match(/^xmlns:/)
          prefixes[attr.name.substring(6)] = attr.value
      prefixes

    getAbout: ->
      if @attrs.about? #and not parent
        next = @context.expandAndResolve(@attrs.about.value)

    getResource: ->
      if @attrs.resource?
        return @context.expandAndResolve(@attrs.resource.value)
      else if @attrs.href?
        return @context.resolveURI(@attrs.href.value)
      else if @attrs.src?
        return @context.resolveURI(@attrs.src.value)

    getTypes: ->
      # TODO: in jsdom, typeof is expanded to typeof="typeof"
      values = @attrs.typeof?.value.split(/\s+/)
      if values
        values = (v for v in values when v isnt 'typeof')
      @expandAll values

    getProperties: ->
      @expandAll @attrs.property?.value.split(/\s+/)

    getRels: ->
      @expandAll @attrs.rel?.value.split(/\s+/)

    getRevs: ->
      @expandAll @attrs.rev?.value.split(/\s+/)

    expandAll: (expressions) ->
      return null unless expressions
      result = []
      for expr in expressions
        iri = @context.expandTermOrCurieOrIRI(expr)
        if iri
          result.push(iri)
      result

    getLiteral: ->
      datatype = @getDatatype()
      lang = @getLang()
      if datatype is RDF_XML_LITERAL
        xml = @getXML()
      else
        content = @getContent()
      if content
        if datatype
          return {value: content, datatype: datatype}
        else if lang
          # TODO: inherited (in compact: if diff. from top-level lang)
          return {value: content, lang: lang}
        else
          return {value: content}
      else# if xml
        return {value: xml, datatype: datatype}

    getContent: ->
      if @attrs.content?
        return @attrs.content.value
      else if @context.profile is 'html' and @tagName is 'time'
        if @attrs.datetime?
          return @attrs.datetime.value
      return @el.textContent

    getXML: ->
      @el.innerHTML

    getDatatype: ->
      if @attrs.datatype?
        dt = @attrs.datatype.value
        return null unless dt
        return @context.expandTermOrCurieOrIRI(dt)
      else if @context.profile is 'html' and @tagName is 'time'
        value = @getContent()
        # TODO: use full iri unless compact..
        if value[0] is 'P'
          return @context.expandTermOrCurieOrIRI('xsd:duration')
        if value.indexOf('T') > -1
          return @context.expandTermOrCurieOrIRI('xsd:dateTime')
        else if value.indexOf(':') > -1
          return @context.expandTermOrCurieOrIRI('xsd:time')
        else
          return @context.expandTermOrCurieOrIRI('xsd:date')
      return null

    isInlist: ->
      @attrs.inlist isnt undefined


  contexts =
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


  bnodeCounter = ->
    # TODO: marker for proper blank?
    prefix = "_:gen-#{(new Date().getTime()).toString(16)}-"
    count = 0
    return -> prefix + count++


  inherit = (obj) ->
    ctor = () ->
    ctor.prototype = obj
    return new ctor


  exports.extract = extract
  exports.Description = Description
  exports.State = State
  exports.Context = Context
  exports.ElementData = ElementData
  exports.contexts = contexts

)(exports ? RDFaParser = {})
