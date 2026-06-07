.PHONY: up test build deploy images-build-jsonl images-upload-template images-submit images-poll images-poll-retry images-status images-rebuild-assets

up:
	npm install
	npm run dev -- --host 0.0.0.0

test:
	npm test -- --run

build:
	npm run build

deploy: test build
	npm run pages

images-build-jsonl:
	npm run images:build-jsonl

images-upload-template:
	npm run images:upload-template

images-submit:
	npm run images:submit

images-poll:
	npm run images:poll

images-poll-retry:
	npm run images:poll-retry

images-status:
	npm run images:status

images-rebuild-assets:
	npm run images:rebuild-assets
