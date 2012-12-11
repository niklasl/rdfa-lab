((exports) ->

  if typeof require is 'function'
    RDFaParser = require "./parser"
  else
     RDFaParser = window.RDFaParser

  RDFA_USES_VOCAB = "http://www.w3.org/ns/rdfa#usesVocabulary"
  ID = '@id'

  exports.extract = (doc, base, profile='html') ->
    doc ?= window.document
    unless base and not window?
      base = window.location.href
    return RDFaParser.parse(builder, doc, base, profile)

  builder =

    start: (state) ->
      state.result = {all: {}}
      getOrCreateNode(state.result, state.context.base)
      return null

    visit: (desc, state) ->
      result = state.result

      if desc.vocab
        baseObj = getOrCreateNode(result, desc.context.base)
        addPropToObj(state, baseObj, RDFA_USES_VOCAB, {'@id': desc.vocab})

      activeSubject = desc.subject or desc.parentSubject
      currentNode = getOrCreateNode(result, activeSubject)
      localNode = getOrCreateNode(result, desc.subject or desc.resource)

      links = desc.linkProperties
      revLinks = desc.reverseLinkProperties
      props = desc.contentProperties
      inlist = desc.inlist
      incomplete = desc.parentIncomplete
      hasLinks = !!(links or revLinks)

      if state.keepList
        state.keepList = incomplete isnt null or activeSubject is desc.parentSubject

      unless desc.subject or hasLinks or props
        return {subject: activeSubject, incomplete: incomplete}

      if incomplete
        completedNode = getOrCreateNode(result, incomplete.subject)
        if desc.subject
          completingNode = localNode
        else
          completingNode = getOrCreateNode(result, incomplete.incompleteSubject)
          currentNode = completingNode
        adder = if incomplete.inlist then addToPropListToObj else addPropToObj
        if incomplete.linkProperties
          for rel in incomplete.linkProperties
            adder(state, completedNode, rel, {'@id': completingNode[ID]})
        if incomplete.reverseLinkProperties
          for rev in incomplete.reverseLinkProperties
            adder(state, completingNode, rev, {'@id': completedNode[ID]})
        incomplete = null

      if hasLinks and not desc.resource
        incomplete = {
          linkProperties: links, reverseLinkProperties: revLinks, inlist: inlist,
          subject: currentNode[ID], incompleteSubject: state.getNextBNode()}

      types = desc.types
      if types
        for type in types
          addPropToObj(state, localNode, "@type", type)

      adder = if inlist then addToPropListToObj else addPropToObj

      resource = desc.resource
      oNode = null
      nestedNode = currentNode
      if resource
        oNode = getOrCreateNode(result, resource)
        if desc.scoped
          nestedNode = oNode
        oref = {"@id": resource}
        if revLinks
          sref = {"@id": activeSubject}
          for rev in revLinks
            adder(state, oNode, rev, sref)
      if resource or inlist
        if links
          for rel in links
            adder(state, currentNode, rel, oref)

      content = desc.content
      if content? or inlist
        if content?
          literal = makeLiteral(content, desc.datatype, desc.lang)
        if props
          for prop in props
            adder(state, currentNode, prop, literal)

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

  addPropToObj = (state, obj, prop, value) ->
    values = obj[prop]
    unless values
      values = obj[prop] = []
    else unless values.push
      values = obj[prop] = [values]
    values.push(value)

  addToPropListToObj = (state, obj, prop, value) ->
    values = obj[prop]
    # TODO: list in Array or direct object (latter prevents sets of mixed refs+lists)
    if values instanceof Array
      if values[0]['@list'] and state.keepList
        values = values[0]['@list']
      else
        l = []
        values.unshift({'@list': l})
        values = l
    else if values
      if state.keepList
        values = values['@list']
      else
        newList = []
        obj[prop] = [values, {"@list": newList}]
        values = newList
    else
      values = []
      obj[prop] = {"@list": values}
    if value?
      values.push(value)
    state.keepList = true

  makeLiteral = (value, datatype, lang) ->
    if datatype # and datatype isnt XSD_LANGLITERAL
      {"@value": value, "@type": datatype}
    else if lang
      {"@value": value, "@language": lang}
    else
      #{"@value": value}
      value

)(exports ? RDFaJSON = {})
