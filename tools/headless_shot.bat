@echo off
rem Headless render of SpaceSim for verification (console errors -> stderr)
"C:\Users\dknauf\AppData\Local\Google\Chrome\Application\chrome.exe" ^
  --headless=new ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-extensions ^
  --allow-file-access-from-files ^
  --user-data-dir="C:\Users\dknauf\.qwen\tmp\spacsim-chrome" ^
  --enable-unsafe-swiftshader ^
  --enable-logging=stderr ^
  --v=0 ^
  --virtual-time-budget=180000 ^
  --screenshot="C:\Users\dknauf\.qwen\tmp\spacsim-shot.png" ^
  --window-size=1600,900 ^
  "file:///C:/Users/dknauf/Documents/VS Code Projects/SpaceSim/index.html"
