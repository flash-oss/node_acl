var chai = require("chai");
var expect = chai.expect;

var testData = {
    key1: ["1", "2", "3"],
    key2: ["3", "2", "4"],
    key3: ["3", "4", "5"],
};
var buckets = ["bucket1", "bucket2"];

describe("unions", function () {
    let backend;

    before(async function () {
        backend = await require("./create-backend")();
        if (!backend.unions) {
            this.skip();
        }

        await backend.clean();
        const transaction = backend.begin();
        for (const key of Object.keys(testData)) {
            for (const bucket of buckets) {
                backend.add(transaction, bucket, key, testData[key]);
            }
        }
        await backend.end(transaction);
    });

    after(async function () {
        if (!backend) return;
        await backend.clean();
        await backend.close();
    });

    it("should respond with an appropriate map", function (done) {
        var expected = {
            bucket1: ["1", "2", "3", "4", "5"],
            bucket2: ["1", "2", "3", "4", "5"],
        };
        backend.unions(buckets, Object.keys(testData), function (err, result) {
            expect(err).to.be.null;
            expect(result).to.be.eql(expected);
            done();
        });
    });

    it("should get only the specified keys", function (done) {
        var expected = {
            bucket1: ["1", "2", "3"],
            bucket2: ["1", "2", "3"],
        };
        backend.unions(buckets, ["key1"], function (err, result) {
            expect(err).to.be.null;
            expect(result).to.be.eql(expected);
            done();
        });
    });

    it("should only get the specified buckets", function (done) {
        var expected = {
            bucket1: ["1", "2", "3"],
        };
        backend.unions(["bucket1"], ["key1"], function (err, result) {
            expect(err).to.be.null;
            expect(result).to.be.eql(expected);
            done();
        });
    });
});
