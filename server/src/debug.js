console.log('Testing Node.js...')
console.log('Node version:', process.version)

try {
  console.log('Testing require...')
  const express = require('express')
  console.log('Express loaded successfully')
  
  const colyseus = require('colyseus')
  console.log('Colyseus loaded successfully')
  console.log('Colyseus exports:', Object.keys(colyseus))
  
} catch (error) {
  console.error('Error loading modules:', error)
}
