// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { SSRFProtection } from './ssrf.js';

describe('SSRFProtection', () => {
  const ssrf = new SSRFProtection();

  it('public URLs pass validation', () => {
    assert.equal(ssrf.validateUrl('https://example.com').safe, true);
    assert.equal(ssrf.validateUrl('https://api.github.com/repos').safe, true);
    assert.equal(ssrf.validateUrl('http://1.2.3.4:8080/path').safe, true);
  });

  it('private IP 10.x.x.x is blocked', () => {
    assert.equal(ssrf.validateUrl('http://10.0.0.1').safe, false);
    assert.equal(ssrf.validateUrl('http://10.255.255.255').safe, false);
    assert.equal(ssrf.validateUrl('http://10.0.0.1:8080/path').safe, false);
  });

  it('private IP 172.16-31.x.x is blocked', () => {
    assert.equal(ssrf.validateUrl('http://172.16.0.1').safe, false);
    assert.equal(ssrf.validateUrl('http://172.31.255.255').safe, false);
    assert.equal(ssrf.validateUrl('http://172.20.0.1').safe, false);
    // 172.15.x.x and 172.32.x.x should be allowed
    assert.equal(ssrf.validateUrl('http://172.15.0.1').safe, true);
    assert.equal(ssrf.validateUrl('http://172.32.0.1').safe, true);
  });

  it('private IP 192.168.x.x is blocked', () => {
    assert.equal(ssrf.validateUrl('http://192.168.0.1').safe, false);
    assert.equal(ssrf.validateUrl('http://192.168.1.1').safe, false);
    assert.equal(ssrf.validateUrl('http://192.168.255.255').safe, false);
  });

  it('localhost 127.0.0.1 is blocked', () => {
    assert.equal(ssrf.validateUrl('http://127.0.0.1').safe, false);
    assert.equal(ssrf.validateUrl('http://127.0.0.1:3000').safe, false);
    assert.equal(ssrf.validateUrl('http://127.255.255.255').safe, false);
  });

  it('link-local 169.254.x.x is blocked', () => {
    assert.equal(ssrf.validateUrl('http://169.254.0.1').safe, false);
    assert.equal(ssrf.validateUrl('http://169.254.169.254').safe, false); // AWS metadata
  });

  it('0.0.0.0 is blocked', () => {
    assert.equal(ssrf.validateUrl('http://0.0.0.0').safe, false);
    assert.equal(ssrf.validateUrl('http://0.0.0.0:8080').safe, false);
  });

  it('non-HTTP protocols are blocked (file://, ftp://, gopher://)', () => {
    const file = ssrf.validateUrl('file:///etc/passwd');
    assert.equal(file.safe, false);
    assert.ok(file.reason.includes('Protocol'));

    const ftp = ssrf.validateUrl('ftp://ftp.example.com');
    assert.equal(ftp.safe, false);
    assert.ok(ftp.reason.includes('Protocol'));

    const gopher = ssrf.validateUrl('gopher://evil.com');
    assert.equal(gopher.safe, false);
    assert.ok(gopher.reason.includes('Protocol'));
  });

  it('invalid URLs are blocked', () => {
    assert.equal(ssrf.validateUrl('not-a-url').safe, false);
    assert.equal(ssrf.validateUrl('').safe, false);
    assert.equal(ssrf.validateUrl('://missing-protocol').safe, false);
  });

  it('URLs with @ in hostname are blocked (bypass attempt)', () => {
    // The URL constructor puts the part before @ as username, not hostname.
    // But we test the hostname detection. URL('http://evil.com@127.0.0.1')
    // has hostname='127.0.0.1' which is a private IP.
    const result = ssrf.validateUrl('http://evil.com@127.0.0.1');
    assert.equal(result.safe, false);
  });

  it('URLs with backslash in hostname are blocked', () => {
    // URL constructor normalizes backslash to forward slash in some contexts.
    // 'http://evil.com\\@127.0.0.1' — test that the result is not safe.
    // The URL parser may throw or normalize — either way it should not pass.
    const result = ssrf.validateUrl('http://evil.com\\@127.0.0.1');
    // Should either be invalid or blocked
    assert.equal(result.safe, false);
  });

  it('allowed hosts whitelist works', () => {
    const restricted = new SSRFProtection({
      allowedHosts: ['api.trusted.com', 'cdn.trusted.com'],
    });

    assert.equal(restricted.validateUrl('https://api.trusted.com/data').safe, true);
    assert.equal(restricted.validateUrl('https://cdn.trusted.com/assets').safe, true);

    const blocked = restricted.validateUrl('https://evil.com');
    assert.equal(blocked.safe, false);
    assert.ok(blocked.reason.includes('not in the allowed hosts'));
  });

  it('empty allowed hosts allows all (except private)', () => {
    const open = new SSRFProtection({ allowedHosts: [] });
    assert.equal(open.validateUrl('https://any-site.com').safe, true);
    assert.equal(open.validateUrl('https://another-site.org/path').safe, true);
    // Still blocks private IPs
    assert.equal(open.validateUrl('http://10.0.0.1').safe, false);
  });

  it('allowedHosts still blocks private IPs', () => {
    const ssrfWithAllow = new SSRFProtection({
      allowedHosts: ['10.0.0.1'],
    });
    // Even if whitelisted as host, the IP is private
    const result = ssrfWithAllow.validateUrl('http://10.0.0.1');
    assert.equal(result.safe, false);
  });

  it('HTTPS URLs pass validation', () => {
    const result = ssrf.validateUrl('https://secure.example.com/api/v1');
    assert.equal(result.safe, true);
    assert.ok(result.reason.includes('passed'));
  });
});
