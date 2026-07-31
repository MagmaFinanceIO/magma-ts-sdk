import { jest } from '@jest/globals'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { TEST_ACCOUNT_MNEMONIC_ENV, TEST_ACCOUNT_NEW_MNEMONIC_ENV, buildTestAccount, buildTestAccountNew } from './data/init_test_data'

describe('signing integration-test credentials', () => {
  afterEach(() => {
    delete process.env[TEST_ACCOUNT_MNEMONIC_ENV]
    delete process.env[TEST_ACCOUNT_NEW_MNEMONIC_ENV]
    jest.restoreAllMocks()
  })

  it.each([
    [TEST_ACCOUNT_MNEMONIC_ENV, buildTestAccount],
    [TEST_ACCOUNT_NEW_MNEMONIC_ENV, buildTestAccountNew],
  ])('fails closed when %s is absent', (envName, buildAccount) => {
    delete process.env[envName]
    expect(buildAccount).toThrow(envName)
  })

  it.each([
    [TEST_ACCOUNT_MNEMONIC_ENV, buildTestAccount],
    [TEST_ACCOUNT_NEW_MNEMONIC_ENV, buildTestAccountNew],
  ])('trims and passes %s to the key derivation function', (envName, buildAccount) => {
    const keypair = Ed25519Keypair.generate()
    const deriveKeypair = jest.spyOn(Ed25519Keypair, 'deriveKeypair').mockReturnValue(keypair)
    process.env[envName] = '  injected-by-a-secret-store  '

    expect(buildAccount()).toBe(keypair)
    expect(deriveKeypair).toHaveBeenCalledWith('injected-by-a-secret-store')
  })

  it('does not contain hardcoded mnemonic assignments in signing helpers', () => {
    const source = readFileSync(resolve(process.cwd(), 'tests/data/init_test_data.ts'), 'utf8')
    const hardcodedMnemonic = /\bmnemonics?\s*=\s*(?:\r?\n\s*)?['"`][a-z]+(?:\s+[a-z]+){11,}['"`]/i
    const literalDerivation = /deriveKeypair\(\s*['"`][^'"`]+['"`]\s*\)/

    expect(source).not.toMatch(hardcodedMnemonic)
    expect(source).not.toMatch(literalDerivation)
  })
})
