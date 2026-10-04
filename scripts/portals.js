// Original 50 IPTV portals from initial AnboxTV scan
// These were reduced to ~17 working, now we test all again
module.exports = {
  PROBE_URLS: {
    // SBH Gold Pro (multiple MACs)
    sbhgoldpro: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:D0:80:82&stream=577220&extension=ts&play_token=Zbx8a3VzTY",
    sbhgoldpro2: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:84:0A:31&stream=577220&extension=ts&play_token=LQ86BzIF2N",
    sbhgoldpro3: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:00:1F:6F&stream=1389529&extension=ts&play_token=cm9g6uJc1x",
    sbhgoldpro4: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:62:33:32&stream=626823&extension=ts&play_token=Rb4hRVC6Rs",
    sbhgoldpro5: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:70:88:83&stream=827982&extension=ts&play_token=GBcrehxdq4",
    sbhgoldpro6: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:B6:C7:AD&stream=577226&extension=ts&play_token=tuKKtAXdHi",
    sbhgoldpro7: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:6d:e3:f2&stream=827982&extension=ts&play_token=7MHJet0pvc",
    
    // Debit
    debit: "http://debitmaxi.com:80/play/live.php?mac=00:1A:79:ca:e9:38&stream=577220&extension=ts&play_token=uOOO76Al9y",
    
    // Dino family
    dinofox: "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:00:23:D6&stream=577220&extension=ts&play_token=U036lFid5L",
    dinofox2: "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:f5:81:14&stream=827982&extension=ts&play_token=yP1EsusZp8",
    dinodox: "http://dinodox.sbs:80/play/live.php?mac=00:1A:79:00:00:1D&stream=577220&extension=ts&play_token=JqJ4zO6p4V",
    dinomultiservice: "http://dinomultiservice.online:80/play/live.php?mac=00:1A:79:b3:e7:5e&stream=500958&extension=ts&play_token=AGhZuDDmNV",
    dino3: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:77:DA:73&stream=552001&extension=ts&play_token=KCi5KBNrnI",
    dino4: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:B6:E4:DA&stream=281635&extension=ts&play_token=KCi5KBNrnI",
    dino5: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:B6:E4:7E&stream=827940&extension=ts&play_token=qteLj9YJpt",
    dinotvuhd: "http://dinotvuhd.com:80/play/live.php?mac=00:1A:79:b5:2a:04&stream=577220&extension=ts&play_token=pc7Yl7fuC4",
    
    // Skunky
    skunky1: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:68:89:7F&stream=1284528&extension=ts&play_token=k71xe1n5Sf",
    skunky3: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:B6:F3:A5&stream=577227&extension=ts&play_token=jtdad5WUqA",
    skunky4: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:B6:F3:A5&stream=577227&extension=ts&play_token=1WKOIaENI7",
    skunky5: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:41:1B:0F&stream=626876&extension=ts&play_token=pYQxDrf2Oh",
    skunkytv: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:26:60:78&stream=577220&extension=ts&play_token=qNYPWHXaz8",
    
    // TrexIPTV
    trexiptv: "http://tv.trexiptv.com:80/play/live.php?mac=00:1A:79:46:71:90&stream=45331&extension=ts&play_token=wYunhZTSSw",
    trexiptv2: "http://tv.trexiptv.com:80/play/live.php?mac=A0:BB:3E:20:2F:96&stream=1014302&extension=ts&play_token=XjAUd9lYS4",
    
    // WoWTV
    wowtv2: "http://wowtv.cc:80/play/live.php?mac=00:1A:79:B6:CB:5A&stream=577227&extension=ts&play_token=wzgzOhA7oQ",
    wowtv3: "http://wowtv.cc:80/play/live.php?mac=00:1A:79:B6:C3:BA&stream=577227&extension=ts&play_token=RECZsVaio0",
    
    // SuiPTV
    suiptv2: "http://suiptv265.xyz:80/play/live.php?mac=00:1A:79:73:A6:5D&stream=577220&extension=ts&play_token=trbtKVDfuG",
    suiptv3: "http://suiptv265.xyz:80/play/live.php?mac=00:1A:79:79:EC:8D&stream=577227&extension=ts&play_token=ZfGCqGNTcy",
    suiptv4: "http://suiptv265.xyz:80/play/live.php?mac=00:1A:79:D2:20:4D&stream=552000&extension=ts&play_token=NyCPozPjUG",
    
    // GreatOTT
    greatott: "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:D0:99:A1&stream=1905818&extension=ts&play_token=b0ZeRWUedS",
    greatott2: "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:A3:FE:76&stream=45331&extension=ts&play_token=n4jXcGXuZ3",
    greatott3: "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:82:61:6F&stream=1468854&extension=ts&play_token=sdrPR4rYXK",
    
    // CWDN
    cwdn: "http://main2.cwdn.cx:80/play/live.php?mac=00:1A:79:78:68:29&stream=577227&extension=ts&play_token=lmRkqQ610m",
    cwdn2: "http://main2.cwdn.cx:80/play/live.php?mac=00:1A:79:73:E6:4C&stream=577227&extension=ts&play_token=FPPXMTxzjH",
    
    // MLNL Dino
    mlnldino: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:c4:67:fa&stream=552000&extension=ts&play_token=Wc3ZjHxRkI",
    minidino2: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:5e:f2:49&stream=577227&extension=ts&play_token=FyUpO9dAe1",
    mlnldino3: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:e7:58:87&stream=708842&extension=ts&play_token=oyHFewi5va",
    
    // TrXX
    trxx: "http://trxx.in:80/play/live.php?mac=00:1A:79:00:00:5A&stream=79725&extension=ts&play_token=IvylNzniaZ",
    trxx2: "http://trxx.in:80/play/live.php?mac=00:1A:79:00:00:AB&stream=45331&extension=ts&play_token=ilXp3Nf9Fo",
    
    // DSMax
    dsmax: "http://dsmax.xyz:80/play/live.php?mac=00:1A:79:7b:4f:9e&stream=1389529&extension=ts&play_token=i4fx8l1iBn",
    
    // iPTVGoat
    iptvgoat: "http://line.iptvgoat.com:80/play/live.php?mac=00:1A:79:24:7A:C0&stream=442785&extension=ts&play_token=uSoeYaSFpS",
    iptvgoat2: "http://line.iptvgoat.com:80/play/live.php?mac=00:1A:79:C3:36:A7&stream=45331&extension=ts&play_token=26cdTVrkJR",
    
    // Diinox
    diinox: "http://diinox.xyz:80/play/live.php?mac=00:1A:79:0f:87:ef&stream=827982&extension=ts&play_token=UipHfOkfaZ",
    diinox2: "http://diinox.xyz:80/play/live.php?mac=00:1A:79:b6:29:1a&stream=827982&extension=ts&play_token=W6GTjvi1BQ",
    
    // Senpay
    senpay25: "http://mag.senpay25.com:80/play/live.php?mac=00:1A:79:85:4B:AA&stream=45592&extension=ts&play_token=9Ae6ILoppJ",
    senpay26: "http://line.senpay23.com:80/play/live.php?mac=00:1A:79:F0:11:85&stream=1032529&extension=ts&play_token=mlS6rWW0yw",
    
    // Other
    ayamed: "http://ayamed.t4t4.xyz:80/play/live.php?mac=00:1A:79:00:00:11&stream=577220&extension=ts&play_token=2Jqaawfiez",
    fri: "http://90309-fri.ott-cdn.me:80/play/live.php?mac=00:1A:79:00:00:0F&stream=1284528&extension=ts&play_token=U9zAJbbFzW",
    godofiptv: "http://line.godofiptv.com:80/play/live.php?mac=A0:BB:3E:02:F1:78&stream=646966&extension=m3u8",
    streamlyy: "http://streamlyy.online:80/play/live.php?mac=00:1A:79:90:e3:e2&stream=577219&extension=ts&play_token=VUKLR6XUv9",
    watchingt: "http://watchingt.site:80/play/live.php?mac=00:1A:79:00:00:1D&stream=577220&extension=ts&play_token=d2YORf2ffT",
  }
};
