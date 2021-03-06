var sinon = require('sinon'),
	mocks = require('mocks'),
	path = require('path'),
	EventEmitter = require('events').EventEmitter,
	protocol = require('../../lib/protocol.js'),
	queenModule;

var createMockWorkerProvider = function(){
	var mock = sinon.spy();
	var eventEmitter = mock.eventEmitter = new EventEmitter();
	
	mock.on = sinon.spy(eventEmitter.on.bind(eventEmitter));
	mock.removeListener = sinon.spy(eventEmitter.removeListener.bind(eventEmitter));
	mock.kill = sinon.spy(function(){eventEmitter.emit('dead')});
	mock.id = "1";
	mock.attributes = {name: "Test"};
	return mock;
};

var mockWorkforce = { 
	create: function(){
		var mock = {};
		var eventEmitter = mock.eventEmitter = new EventEmitter();
		mock.populate = sinon.spy();
		mock.api = sinon.spy();
		mock.api.self = mock;
		mock.api.on = sinon.spy(eventEmitter.on.bind(eventEmitter));
		mock.api.removeListener = sinon.spy(eventEmitter.removeListener.bind(eventEmitter));
		mock.api.kill = sinon.spy(function(){eventEmitter.emit('dead')});
		mock.start = sinon.spy(function(){eventEmitter.emit('start')});
		mock.api.start = sinon.spy(function(){eventEmitter.emit('start')});
		mock.api.stop = sinon.spy();
		return mock;
	}
};

queenModule = mocks.loadFile(
	path.resolve(path.dirname(module.filename), '../../lib/server/queen.js'),
	{
		'./workforce.js': mockWorkforce
	}
);

var Queen = queenModule.Queen;
var create = queenModule.create;

var TEST_STRING = "Hello, world!";
var TEST_OBJECT = {
	message: TEST_STRING
};

var createMockSocketServer = function(){
	var mock = {};
	mock.socket = createMockSocket();
	mock.of = sinon.stub().returns(mock.socket);
	return mock;
};

var createMockSocket = function(){
	var socket = {};
	var eventEmitter = socket.eventEmitter = new EventEmitter();
	socket.on = eventEmitter.on.bind(eventEmitter);
	socket.removeListener = eventEmitter.removeListener.bind(eventEmitter);
	socket.disconnect = sinon.spy();
	socket.send = sinon.spy();

	return socket;
};

var createMockPopulator = function(){
	var populator = sinon.spy();
	populator.clientConfig = {browser:"chrome"};
	populator.clients = [populator.clientConfig];
	return populator;
};


exports.queen = {
	setUp: function(callback){
		this.socketServer = createMockSocketServer();
		this.socket = this.socketServer.socket;
		this.queen = new Queen(this.socketServer, {all:sinon.spy(), use: sinon.spy()}, "");
		this.api = queenModule.getApi(this.queen);
		callback();
	},
	construct: function(test){
		var queen;
		
		queen = new Queen(this.socketServer, {all:sinon.spy(), use:sinon.spy()}, "");
		test.ok(queen instanceof Queen, "Unable to construct with valid params");

		test.done();
	},
	addWorkerProvider: function(test){
		var spy = sinon.spy();
		this.api.on("workerProvider", spy);
		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		test.ok(spy.calledWith(provider), "Worker provider not emitted");
		test.done();
	},
	workerProviderDead: function(test){
		var spy = sinon.spy();
		this.api.on("workerProviderDead", spy);
		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		provider.kill();
		test.ok(spy.calledWith(provider.id), "Worker provider death not emitted");
		test.done();
	},
	getWorkerProvider: function(test){
		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		var result = this.queen.getWorkerProvider(provider.id);
		test.strictEqual(result, provider, "Same provider didn't return");
		test.done();
	},
	getWorkerProviders: function(test){
		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		var result = this.queen.getWorkerProviders();
		test.strictEqual(result[0], provider, "Same provider didn't return");
		test.strictEqual(result.length, 1, "Only one provider should have been added");
		test.done();
	},
	connectionHandler: function(test){
		var stub = sinon.spy(this.queen, "addWorkerProvider");
		var connection = createMockSocket();
		
		this.socket.eventEmitter.emit('connection', connection);
		
		test.ok(!stub.called, "Worker provider added without registering");
		connection.eventEmitter.emit("message", JSON.stringify([protocol.WORKER_PROVIDER_MESSAGE_TYPE['register'], {}]));
		test.ok(stub.called, "Worker provider not added after registering");
		
		test.done();
	},
	registerationTimeout: function(test){
		test.expect(1);

		this.queen.registerationTimeout = 1;
		
		var connection = createMockSocket();
		this.socket.eventEmitter.emit('connection', connection);
		
		setTimeout(function(){
			test.ok(connection.disconnect.calledOnce, "Disconnect not called");
			test.done();
		},2);
	},
	getWorkforce: function(test){
		var spy = sinon.spy();
		this.api.on('workforce', spy);

		var workforce = this.queen.getWorkforce({});

		test.notStrictEqual(workforce, void 0, "Workforce is undefined");
		test.ok(spy.calledWith(workforce), "Workforce not emitted");

		test.done();
	},
	workforceDead: function(test){
		var spy = sinon.spy();
		this.api.on('workforceDead', spy);

		var workforce = this.queen.getWorkforce({});
		workforce.kill();
		test.ok(spy.calledWith(workforce.id), "Workforce death not emitted");

		test.done();
	},
	populateOnce: function(test){
		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		
		var workforce = this.queen.getWorkforce({
			populate:"once"
		});

		test.ok(workforce.self.populate.lastCall.args[0][0] === provider, "Populate not called");

		test.done();
	},
	continuousPopulation: function(test){
		var workforce = this.queen.getWorkforce({
			populate:"continuous"
		});

		test.ok(workforce.self.populate.lastCall.args[0].length === 0, "Populate was called");

		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);

		test.ok(workforce.self.populate.lastCall.args[0] === provider, "Populate not called");

		test.done();
	},
	kill: function(test){
		var spy = sinon.spy();
		this.api.on('dead', spy);

		var provider = createMockWorkerProvider();
		this.queen.addWorkerProvider(provider);
		
		var workforce = this.queen.getWorkforce({});

		this.queen.kill();

		test.ok(spy.called, "Death not emitted");
		test.ok(workforce.kill.called, "Workforces not killed");
		test.ok(provider.kill.called, "Providers not killed");
		test.done();
	}
};