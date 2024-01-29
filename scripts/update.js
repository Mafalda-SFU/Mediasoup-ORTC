#!/usr/bin/env node

const {mkdir, rm, writeFile} = require('node:fs/promises');
const {sep} = require('node:path');
const {Readable} = require('node:stream');
const {text} = require('node:stream/consumers');
const {createGunzip} = require('node:zlib');

const tar = require('tar-stream');
const ts = require('typescript');


const options = {force: true, recursive: true}
const repo = 'versatica/mediasoup'


const {argv: [,, version]} = process;


(async function()
{
  const [{body}] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/tarball/${version}`),
    rm('src', options)
    .then(mkdir.bind(null, 'src', options))
  ])

  const extract = Readable.fromWeb(body).pipe(createGunzip()).pipe(tar.extract())

  for await (const entry of extract)
  {
    const {name} = entry.header

    let path = name.split(sep)
    path.shift()
    path = path.join(sep)

    if(
      path === 'node/tsconfig.json' ||
      path === 'node/src/supportedRtpCapabilities.ts'
    ) {
      path = path.split(sep)
      path.shift()
      path = path.join(sep)

      const content = await text(entry);

      await writeFile(path, content, 'utf8')
      continue
    }

    if(path === 'node/src/ortc.ts')
    {
      path = path.split(sep)
      path.shift()
      path = path.join(sep)

      let content = await text(entry);

      const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest);

      const importIdentifiers = [
        'h264-profile-level-id',
        './supportedRtpCapabilities',
        './scalabilityModes',
        './RtpParameters',
        './utils'
      ]
      const functionIdentifiers = [
        'validateRtpCapabilities',
        'generateRouterRtpCapabilities',
        'getProducerRtpParametersMapping',
        'getConsumableRtpParameters',
        'canConsume',
        'getConsumerRtpParameters',
        'getPipeConsumerRtpParameters',
        'isRtxCodec',
        'matchCodecs',
        'validateRtpCodecCapability',
        'validateRtcpFeedback',
        'validateRtpHeaderExtension'
      ]

      content = [];
      ts.forEachChild(sourceFile, function(node)
      {
        if(ts.isImportDeclaration(node))
        {
          if(importIdentifiers.includes(node.moduleSpecifier?.text))
          {
            let line = node.getFullText(sourceFile)

            if(line.includes('./scalabilityModes'))
              line = line.replace(
                './scalabilityModes', '@mafalda-sfu/scalabilitymodes'
              )

            else if(line.includes('./RtpParameters'))
              line = line.replace(
                '\n\tRtpHeaderExtensionParameters,\n\tRtcpParameters,', ''
              )

            content.push(line);
          }
        }

        else if(ts.isTypeAliasDeclaration(node))
        {
          if(node.name?.text === 'RtpMapping')
            content.push(node.getFullText(sourceFile));
        }

        else if(ts.isVariableStatement(node))
        {
          if(node.getText(sourceFile).includes('DynamicPayloadTypes'))
            content.push(node.getFullText(sourceFile));
        }

        else if(ts.isFunctionDeclaration(node))
        {
          if(functionIdentifiers.includes(node.name?.text))
          {
            let line = node.getFullText(sourceFile)

            line = line.replaceAll('UnsupportedError', '/*Unsupported*/Error')

            content.push(line);
          }
        }
      });

      content = content.join('\n')

      await writeFile(path, content, 'utf8')
      continue
    }

    if(path === 'node/src/RtpParameters.ts')
    {
      path = path.split(sep)
      path.shift()
      path = path.join(sep)

      let content = await text(entry);

      const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest);

      content = [];
      ts.forEachChild(sourceFile, function(node)
      {
        if(ts.isTypeAliasDeclaration(node))
          content.push(node.getFullText(sourceFile));
      });

      content = content.join('\n')

      await writeFile(path, content, 'utf8')
      continue
    }

    if(path === 'node/src/utils.ts')
    {
      path = path.split(sep)
      path.shift()
      path = path.join(sep)

      let content = await text(entry);

      const sourceFile = ts.createSourceFile(path, content, ts.ScriptTarget.Latest);

      const functionIdentifiers = [
        'clone',
        'generateRandomNumber'
      ]

      content = [];
      ts.forEachChild(sourceFile, function(node)
      {
        if(ts.isImportDeclaration(node))
        {
          if(node.moduleSpecifier?.text === 'node:crypto')
          {
            let line = node.getFullText(sourceFile)

            line = line.replace('randomUUID, ', '')

            content.push(line);
          }
        }

        else if(ts.isFunctionDeclaration(node))
        {
          if(functionIdentifiers.includes(node.name?.text))
            content.push(node.getFullText(sourceFile));
        }
      });

      content = content.join('\n')

      await writeFile(path, content, 'utf8')
      continue
    }

    entry.resume()
  }
})()
