require('../server/proxy/xray.cjs').main().catch(e=>{console.error(e.message);process.exitCode=1;});
