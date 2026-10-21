Derived from iptag/jimeng-api (GPL-3.0), upstream b9a4199, local international fork b85bde6 plus StoryDock bridge 0af62bb.
Only used for storyboard video generation. Install dependencies with npm ci; rebuild bridge with npm run build:bridge. Chromium must also be installed.

StoryDock additionally includes an internal check-upload stdio diagnostic for proxy verification; requests are proxied by the parent-controlled preload module.
