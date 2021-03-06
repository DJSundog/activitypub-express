'use strict'
const httpSignature = require('http-signature')
// http communication middleware
module.exports = {
  verifyActor,
  verifySignature
}

function verifyActor (req, res, next) {
  const apex = req.app.locals.apex
  const locals = res.locals.apex
  const actor = apex.actorIdFromActivity(req.body)
  if (locals.sender && locals.sender.id === actor) {
    locals.verified = true
  }
  // TODO: LD-signatures verification and/or check for valid inbox forwarding cases
}

async function verifySignature (req, res, next) {
  try {
    const apex = req.app.locals.apex
    // support for apps not using signature extension to ActivityPub
    if (!req.get('authorization') && !req.get('signature')) {
      const actor = await apex.resolveObject(apex.actorIdFromActivity(req.body))
      if (actor.publicKey && req.app.get('env') !== 'development') {
        console.log('Missing http signature')
        return res.status(400).send('Missing http signature')
      }
      res.locals.apex.sender = actor
      return next()
    }
    const sigHead = httpSignature.parse(req)
    const signer = await apex.resolveObject(sigHead.keyId, req.app.get('db'))
    const valid = httpSignature.verifySignature(sigHead, signer.publicKey[0].publicKeyPem[0])
    if (!valid) {
      console.log('signature validation failure', sigHead.keyId)
      return res.status(400).send('Invalid http signature')
    }
    res.locals.apex.sender = signer
    next()
  } catch (err) {
    if (req.body.type === 'Delete' && err.message.startsWith('410')) {
      // user delete message that can't be verified because we don't have the user cached
      return res.status(200).send()
    }
    console.log('error during signature verification', err.message, req.body)
    return res.status(500).send()
  }
}
