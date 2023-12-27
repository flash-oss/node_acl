const assert = require("node:assert/strict");

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
        const transaction = await backend.begin();
        for (const key of Object.keys(testData)) {
            for (const bucket of buckets) {
                await backend.add(transaction, bucket, key, testData[key]);
            }
        }
        await backend.end(transaction);
    });

    after(async function () {
        if (!backend) return;
        await backend.clean();
        await backend.close();
    });

    it("should respond with an appropriate map", async function () {
        var expected = {
            bucket1: ["1", "2", "3", "4", "5"],
            bucket2: ["1", "2", "3", "4", "5"],
        };

        const result = await backend.unions(buckets, Object.keys(testData));

        assert.deepEqual(result, expected);
    });

    it("should get only the specified keys", async function () {
        var expected = {
            bucket1: ["1", "2", "3"],
            bucket2: ["1", "2", "3"],
        };

        const result = await backend.unions(buckets, ["key1"]);

        assert.deepEqual(result, expected);
    });

    it("should only get the specified buckets", async function () {
        var expected = {
            bucket1: ["1", "2", "3"],
        };

        const result = await backend.unions(["bucket1"], ["key1"]);

        assert.deepEqual(result, expected);
    });
});
