# On development servers we have to use versioned node and a unix-socket.
# Otherwise (for local development) we use the /usr/bin/node and a web-socket (localhost:<port>).
# Bellow you can see this detection.
SERVER_NODE := /opt/nodejs/0.10/bin/node
SERVER_NPM := /opt/nodejs/0.10/bin/npm
LOCAL_NODE := node
LOCAL_NPM := npm

NODE := $(firstword $(shell which $(SERVER_NODE) $(LOCAL_NODE)))
NPM := $(firstword $(shell which $(SERVER_NPM) $(LOCAL_NPM)))
NODE_MODULES_BIN := node_modules/.bin

hooks:
	@-$(NODE_MODULES_BIN)/git-hooks --uninstall
	@$(NODE_MODULES_BIN)/git-hooks --install

# Validation
validate: lint test

# Lint js files
lint:
	@$(NODE) $(NODE_MODULES_BIN)/jshint-groups
	@$(NODE) $(NODE_MODULES_BIN)/jscs .
	@$(NODE) $(NODE_MODULES_BIN)/analyze report -r errors -v return-type=-getBlockName:param-type

# Build and run client tests
test-client:
	$(NODE) $(ENB) make test -n
	$(NODE) $(NODE_MODULES_BIN)/mocha-phantomjs $(MOCHA_FLAGS) test/client/test.html

# Run all test
test: test-client