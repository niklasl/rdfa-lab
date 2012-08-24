((exports) ->

  RDF_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  XHV_IRI = "http://www.w3.org/1999/xhtml/vocab#"
  RDF_XML_LITERAL = RDF_IRI + 'XMLLiteral'
  RDFA_USES_VOCAB = "http://www.w3.org/ns/rdfa#usesVocabulary"
  ID = '@id'


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
        addPropToObj(baseObj, RDFA_USES_VOCAB, {'@id': desc.vocab})

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
            adder(completedNode, rel, {'@id': completingNode[ID]})
          for rev in incomplete.reverseLinkProperties
            adder(completingNode, rev, {'@id': completedNode[ID]})
          incomplete = null

      if hasLinks and not desc.resource
        incomplete = {
          linkProperties: rels, reverseLinkProperties: revs, inlist: inlist,
          subject: currentNode[ID], incompleteSubject: getNextBNode()}

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
        if revs.length
          sref = {"@id": s}
          for rev in revs
            adder(oNode, rev, sref)
      if o or inlist
        for rel in rels
          adder(currentNode, rel, oref)

      content = desc.content
      if content? or inlist
        if content?
          literal = makeLiteral(content, desc.datatype, desc.lang)
        for prop in props
          adder(currentNode, prop, literal)

      return {subject: nestedNode[ID], incomplete: incomplete}

    complete: (state) ->
      items = []
      for s, obj of state.result.all
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
    if value?
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
      if expr.indexOf(":") isnt -1
        return @expandCurieOrIRI(expr)
      if @vocab
        return @vocab + expr
      iri = @prefixes[expr] or @prefixes[expr.toLowerCase()]
      if iri
        return iri
      return null

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
      if pfx.length is 0
        return XHV_IRI + term
      ns = @prefixes[pfx]
      if ns
        return ns + term
      return expr

    expandAndResolve: (curieOrIri) ->
      # TODO: expandOrResolve?
      return null if curieOrIri is '[]'
      iri = @expandCurieOrIRI(curieOrIri)
      return iri if iri[0] is '_'
      # TODO: hack to avoid jsdom(?) lowercasing e.g. urn:isbn:* to urn:isbn:*!
      resolved = @resolveURI(iri)
      return iri if resolved.length is iri.length
      return resolved


  ##
  # A representation of the interpreted description formed by the logical
  # attributes of an element. Use this to produce triples.
  class Description
    constructor: (el, state) ->
      # TODO: state or= computeState(el)
      @parentSubject = state.subject
      @parentIncomplete = state.incomplete

      data = new ElementData(el, state.context, @parentSubject)
      @errors = data.errors
      @lang = data.getLang() ? state.lang
      @vocab = data.getVocab()
      @context = data.context

      @types = data.getTypes()

      props = data.getProperties()
      resource = data.getResource()
      rels = data.getRels()
      revs = data.getRevs()
      about = data.getAbout()

      resourceIsTyped = !!(@types and not about)
      hasContentAttrs = !!(data.contentAttr? or data.datatypeAttr?)
      propsAsLinks = !!(props and (not (rels or revs)) and
          (resource or resourceIsTyped) and not hasContentAttrs)

      @contentProperties = if (props and not propsAsLinks) then props else []
      @linkProperties = if rels then rels else if propsAsLinks then props else []
      @reverseLinkProperties = revs or []
      @inlist = data.isInlist()

      if resource
        @resource = resource
      else if resourceIsTyped and (rels or props)
        @resource = getNextBNode()

      @scoped = @resource and (not (propsAsLinks or hasContentAttrs)) or resourceIsTyped

      @subject = about or @getResourceAsSubject()

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
    constructor: (@el, parentContext, parentSubject) ->
      @attrs = @el.attributes
      @isRoot = @el.parentNode is @el.ownerDocument
      @tagName = @el.nodeName.toLowerCase()
      @parentSubject = parentSubject
      @errors = []
      @context = parentContext.createSubContext(
        @getBase(), @getVocab(), @getPrefixes())
      @contentAttr = @getContentAttr()
      @datatypeAttr = @getDatatypeAttr()

    getBase: ->
      null # xml:base if XML-based profile

    getLang: ->
      @attrs['xml:lang']?.value or @attrs.lang?.value

    getContentAttr: ->
      if @context.profile is 'html'
        if @tagName is 'time' and @attrs.datetime?
          return @attrs.datetime.value
        else if @tagName is 'data' and @attrs.value?
          return @attrs.value.value
      if @attrs.content?
        return @attrs.content.value

    getDatatypeAttr: ->
      if @attrs.datatype?
        dt = @attrs.datatype.value
        return "" unless dt
        return @context.expandTermOrCurieOrIRI(dt)

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
        @context.expandAndResolve(@attrs.about.value)
      else if @isRoot
        @parentSubject
      else if (@tagName is 'head' or @tagName is 'body') and not @attrs.resource?
        @parentSubject

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
      @expandAll @attrs.rel?.value.split(/\s+/), true

    getRevs: ->
      @expandAll @attrs.rev?.value.split(/\s+/), true

    expandAll: (expressions, weak=false) ->
      return null unless expressions
      result = []
      isHtml = @context.profile is 'html'
      prop = @attrs.property?
      muted = false
      for expr in expressions
        if weak and isHtml and prop and expr.indexOf(':') is -1
          muted = true
          continue
        iri = @context.expandTermOrCurieOrIRI(expr)
        if iri and iri[0] isnt '_'
          result.push(iri)
      if muted and result.length is 0
        return null
      result

    getLiteral: ->
      datatype = @getDatatype()
      lang = @getLang()
      if datatype is RDF_XML_LITERAL
        xml = @getXML()
      else
        content = @getContent()
      if content?
        if datatype
          return {value: content, datatype: datatype}
        else if lang
          return {value: content, lang: lang}
        else
          return {value: content}
      else# if xml
        return {value: xml, datatype: datatype}

    getContent: ->
      return @contentAttr or @el.textContent

    getXML: ->
      @el.innerHTML

    getDatatype: ->
      if @datatypeAttr
        return @datatypeAttr
      else if @context.profile is 'html' and @tagName is 'time'
        value = @getContent()
        # TODO: use full iri unless compact..
        if value.indexOf(' ') isnt -1
          return null
        if value[0] is 'P'
          return @context.expandTermOrCurieOrIRI('xsd:duration')
        if value.indexOf('T') > -1
          return @context.expandTermOrCurieOrIRI('xsd:dateTime')
        else if value.indexOf(':') > -1
          return @context.expandTermOrCurieOrIRI('xsd:time')
        else if value.match(/^\d{4,}$/)
          return @context.expandTermOrCurieOrIRI('xsd:gYear')
        else if value.match(/^\d{4,}-\d{2}$/)
          return @context.expandTermOrCurieOrIRI('xsd:gYearMonth')
        else if value.match(/^\d{4,}-\d{2}-\d{2}(Z|[+-]\d{2}:?\d{2})?$/)
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
