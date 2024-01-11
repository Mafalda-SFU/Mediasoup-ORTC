#!/usr/bin/env node

const PackageJson = require('@npmcli/package-json');
const simpleGit = require('simple-git');


(async function()
{
  const {content: {version}} = await PackageJson.load('.')

  const git = simpleGit()

  await git.add('.')
  await git.commit(`Update to mediasoup@${version}`)
  await git.addTag(version)

  await Promise.all([
    git.push(),
    git.pushTags()
  ])
})()
