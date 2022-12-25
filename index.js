export default {
  async fetch(request, env) {
    return await handleRequest(request)
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("q") || 'cnOgv/KdpLoP6Nbh0GMkXkPXALQ=';
  const { err, diff, elpased } = getTimeOffset();
  if (err) {
    return new Response(err.message);
  } else {
    return new Response(await generateAuthCode(secret, diff));
  }
}

/**
 * Returns the current local Unix time in seconds.
 * @param {number} [timeOffset=0] - This many seconds will be added to the returned time
 * @returns {number}
 */
function getTime(timeOffset) {
  return Math.floor(Date.now() / 1000) + (timeOffset || 0);
};

function base64ToArrayBuffer(base64) {
  const bs = atob(base64);
  const len = bs.length;
  const bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = bs.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getTimeOffset() {
  let start = Date.now();
  const steamTimeApi = 'https://api.steampowered.com/ITwoFactorService/QueryTime/v1/';
  let obj = {
    err: null,
    diff: 0,  // In seconds
    elapsed: 0,
  };
  await fetch(steamTimeApi, {
    method: 'POST',
    headers: {
      "Content-Length": 0,
    }
  })
    .then((res) => {
      console.log(res.status);
      if (res.status != 200) {
        console.log(`HTTP error ${res.status}.`)
        obj.err = new Error(`HTTP error ${res.status}.`);
        return null;
      }
      return res.json();
    })
    .then((data) => {
      if (!data || !data.server_time) {
        obj.err = new Error("Malformed response");
      } else {
        obj.diff = data['server_time'] - getTime();
      }
    });
  obj.elapsed = Date.now() - start;
  return obj;
};

/**
 * Generate a Steam-style TOTP authentication code.
 * @param {string} secret - Your TOTP shared_secret as base64 encoded string
 * @param {number} [timeDiff=0] - If you know how far off your clock is from the Steam servers, put the offset here in seconds
 * @returns {string}
 */
async function generateAuthCode(secret, timeDiff = 0) {

  secret = base64ToArrayBuffer(secret);

  let time = getTime(timeDiff);

  let arrayBuffer = new ArrayBuffer(8);
  let buffer = new Uint32Array(arrayBuffer);
  // The first 4 bytes are the high 4 bytes of a 64-bit integer. To make things easier on ourselves, let's just pretend
  // that it's a 32-bit int and write 0 for the high bytes. Since we're dividing by 30, this won't cause a problem
  // until the year 6053.
  buffer[0] = 0;
  buffer[1] = Math.floor(time / 30);

  const hmac = await crypto.subtle.importKey(
    'raw',
    secret,
    {name: 'HMAC', hash: 'SHA-1'},
    false,
    ['sign']
  );

  const hmacValue = await crypto.subtle.sign('HMAC', hmac, buffer);
  const hmacArray = new Uint8Array(hmacValue);

  let offset = hmacArray[hmacArray.length - 1] & 0x0F;
  const view = new Uint32Array(hmacArray.slice(offset, offset + 4));

  let fullcode = view[0] & 0x7FFFFFFF;

  const chars = '23456789BCDFGHJKMNPQRTVWXY';

  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(fullcode % chars.length);
    fullcode /= chars.length;
  }

  return code;
};
