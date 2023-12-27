const Acl = require("../");
const assert = require("node:assert/strict");
const _ = require("lodash");

describe("acl", () => {
    let backend;

    before(async function () {
        backend = await require("./create-backend")();
    });

    after(async function () {
        if (!backend) return;
        await backend.clean();
        await backend.close();
    });

    describe("constructor", function () {
        it("should use default `buckets` names", function () {
            const acl = new Acl(backend);

            assert.equal(acl.options.buckets.meta, "meta");
            assert.equal(acl.options.buckets.parents, "parents");
            assert.equal(acl.options.buckets.permissions, "permissions");
            assert.equal(acl.options.buckets.resources, "resources");
            assert.equal(acl.options.buckets.roles, "roles");
            assert.equal(acl.options.buckets.users, "users");
        });

        it("should use given `buckets` names", function () {
            const acl = new Acl(backend, null, {
                buckets: {
                    meta: "Meta",
                    parents: "Parents",
                    permissions: "Permissions",
                    resources: "Resources",
                    roles: "Roles",
                    users: "Users",
                },
            });

            assert.equal(acl.options.buckets.meta, "Meta");
            assert.equal(acl.options.buckets.parents, "Parents");
            assert.equal(acl.options.buckets.permissions, "Permissions");
            assert.equal(acl.options.buckets.resources, "Resources");
            assert.equal(acl.options.buckets.roles, "Roles");
            assert.equal(acl.options.buckets.users, "Users");
        });
    });

    describe("allow", function () {
        this.timeout(10000);

        it("guest to view blogs", async function () {
            const acl = new Acl(backend);

            await acl.allow("guest", "blogs", "view");
        });

        it("guest to view forums", async function () {
            const acl = new Acl(backend);

            await acl.allow("guest", "forums", "view");
        });

        it("member to view/edit/delete blogs", async function () {
            const acl = new Acl(backend);

            await acl.allow("member", "blogs", ["edit", "view", "delete"]);
        });
    });

    describe("Add user roles", function () {
        it("joed => guest, jsmith => member, harry => admin, test@test.com => member", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("joed", "guest");
            await acl.addUserRoles("jsmith", "member");
            await acl.addUserRoles("harry", "admin");
            await acl.addUserRoles("test@test.com", "member");
        });

        it("0 => guest, 1 => member, 2 => admin", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("0", "guest");
            await acl.addUserRoles("1", "member");
            await acl.addUserRoles("2", "admin");
        });
    });

    describe("read User Roles", function () {
        it("run userRoles function", async function () {
            const acl = new Acl(backend);
            await acl.addUserRoles("harry", "admin");

            const roles = await acl.userRoles("harry");
            assert.deepEqual(roles, ["admin"]);

            let is_in_role = await acl.hasRole("harry", "admin");
            assert.ok(is_in_role);

            is_in_role = await acl.hasRole("harry", "no role");
            assert.ok(!is_in_role);
        });
    });

    describe("read Role Users", function () {
        it("run roleUsers function", async function () {
            const acl = new Acl(backend);
            await acl.addUserRoles("harry", "admin");

            const users = await acl.roleUsers("admin");

            assert(users.includes("harry"));
            assert(!("invalid User" in users));
        });
    });

    describe("allow", function () {
        it("admin view/add/edit/delete users", async function () {
            const acl = new Acl(backend);

            await acl.allow("admin", "users", ["add", "edit", "view", "delete"]);
        });

        it("foo view/edit blogs", async function () {
            const acl = new Acl(backend);

            await acl.allow("foo", "blogs", ["edit", "view"]);
        });

        it("bar to view/delete blogs", async function () {
            const acl = new Acl(backend);

            await acl.allow("bar", "blogs", ["view", "delete"]);
        });
    });

    describe("add role parents", function () {
        it("add them", async function () {
            const acl = new Acl(backend);

            await acl.addRoleParents("baz", ["foo", "bar"]);
        });
    });

    describe("add user roles", function () {
        it("add them", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("james", "baz");
        });

        it("add them (numeric userId)", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("3", "baz");
        });
    });

    describe("allow admin to do anything", function () {
        it("add them", async function () {
            const acl = new Acl(backend);

            await acl.allow("admin", ["blogs", "forums"], "*");
        });
    });

    describe("Arguments in one array", function () {
        it("give role fumanchu an array of resources and permissions", async function () {
            const acl = new Acl(backend);

            await acl.allow([
                {
                    roles: "fumanchu",
                    allows: [
                        { resources: "blogs", permissions: "get" },
                        {
                            resources: ["forums", "news"],
                            permissions: ["get", "put", "delete"],
                        },
                        {
                            resources: ["/path/file/file1.txt", "/path/file/file2.txt"],
                            permissions: ["get", "put", "delete"],
                        },
                    ],
                },
            ]);
        });
    });

    describe("Add fumanchu role to suzanne", function () {
        it("do it", async function () {
            const acl = new Acl(backend);
            await acl.addUserRoles("suzanne", "fumanchu");
        });

        it("do it (numeric userId)", async function () {
            const acl = new Acl(backend);
            await acl.addUserRoles("4", "fumanchu");
        });
    });

    describe("Allowance queries", function () {
        describe("isAllowed", function () {
            it("Can joed view blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("joed", "blogs", "view"));
            });

            it("Can userId=0 view blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("0", "blogs", "view"));
            });

            it("Can joed view forums?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("joed", "forums", "view"));
            });

            it("Can userId=0 view forums?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("0", "forums", "view"));
            });

            it("Can joed edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("joed", "forums", "edit")));
            });

            it("Can userId=0 edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("0", "forums", "edit")));
            });

            it("Can jsmith edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("jsmith", "forums", "edit")));
            });

            it("Can jsmith edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("jsmith", "forums", "edit")));
            });

            it("Can jsmith edit blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("jsmith", "blogs", "edit"));
            });

            it("Can test@test.com edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("test@test.com", "forums", "edit")));
            });

            it("Can test@test.com edit forums?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("test@test.com", "forums", "edit")));
            });

            it("Can test@test.com edit blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("test@test.com", "blogs", "edit"));
            });

            it("Can userId=1 edit blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("1", "blogs", "edit"));
            });

            it("Can jsmith edit, delete and clone blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("jsmith", "blogs", ["edit", "view", "clone"])));
            });

            it("Can test@test.com edit, delete and clone blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("test@test.com", "blogs", ["edit", "view", "clone"])));
            });

            it("Can userId=1 edit, delete and clone blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("1", "blogs", ["edit", "view", "clone"])));
            });

            it("Can jsmith edit, clone blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("jsmith", "blogs", ["edit", "clone"])));
            });

            it("Can test@test.com edit, clone blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("test@test.com", "blogs", ["edit", "clone"])));
            });

            it("Can userId=1 edit, delete blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("1", "blogs", ["edit", "clone"])));
            });

            it("Can james add blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("james", "blogs", "add")));
            });

            it("Can userId=3 add blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("3", "blogs", "add")));
            });

            it("Can suzanne add blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("suzanne", "blogs", "add")));
            });

            it("Can userId=4 add blogs?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("4", "blogs", "add")));
            });

            it("Can suzanne get blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("suzanne", "blogs", "get"));
            });

            it("Can userId=4 get blogs?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("4", "blogs", "get"));
            });

            it("Can suzanne delete and put news?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("suzanne", "news", ["put", "delete"]));
            });

            it("Can userId=4 delete and put news?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("4", "news", ["put", "delete"]));
            });

            it("Can suzanne delete and put forums?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("suzanne", "forums", ["put", "delete"]));
            });

            it("Can userId=4 delete and put forums?", async function () {
                const acl = new Acl(backend);

                assert(await acl.isAllowed("4", "forums", ["put", "delete"]));
            });

            it("Can nobody view news?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("nobody", "blogs", "view")));
            });

            it("Can nobody view nothing?", async function () {
                const acl = new Acl(backend);

                assert(!(await acl.isAllowed("nobody", "nothing", "view")));
            });
        });

        describe("allowedPermissions", function () {
            it("What permissions has james over blogs and forums?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("james", ["blogs", "forums"]);

                assert(permissions.blogs);
                assert(permissions.forums);

                assert(permissions.blogs.includes("edit"));
                assert(permissions.blogs.includes("delete"));
                assert(permissions.blogs.includes("view"));

                assert(permissions.forums.length === 0);
            });

            it("What permissions has userId=3 over blogs and forums?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("3", ["blogs", "forums"]);

                assert(permissions.blogs);
                assert(permissions.forums);

                assert(permissions.blogs.includes("edit"));
                assert(permissions.blogs.includes("delete"));
                assert(permissions.blogs.includes("view"));

                assert(permissions.forums.length === 0);
            });

            it("What permissions has nonsenseUser over blogs and forums?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("nonsense", ["blogs", "forums"]);

                assert(permissions.forums.length === 0);
                assert(permissions.blogs.length === 0);
            });
        });
    });

    describe("whatResources queries", function () {
        it('What resources have "bar" some rights on?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("bar");

            assert(resources.blogs.includes("view"));
            assert(resources.blogs.includes("delete"));
        });

        it('What resources have "bar" view rights on?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("bar", "view");

            assert(resources.includes("blogs"));
        });

        it('What resources have "fumanchu" some rights on?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("fumanchu");

            assert(resources.blogs.includes("get"));
            assert(resources.forums.includes("delete"));
            assert(resources.forums.includes("get"));
            assert(resources.forums.includes("put"));
            assert(resources.news.includes("delete"));
            assert(resources.news.includes("get"));
            assert(resources.news.includes("put"));
            assert(resources["/path/file/file1.txt"].includes("delete"));
            assert(resources["/path/file/file1.txt"].includes("get"));
            assert(resources["/path/file/file1.txt"].includes("put"));
            assert(resources["/path/file/file2.txt"].includes("delete"));
            assert(resources["/path/file/file2.txt"].includes("get"));
            assert(resources["/path/file/file2.txt"].includes("put"));
        });

        it('What resources have "baz" some rights on?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("baz");

            assert(resources.blogs.includes("view"));
            assert(resources.blogs.includes("delete"));
            assert(resources.blogs.includes("edit"));
        });
    });

    describe("removeAllow", function () {
        it("Remove get permissions from resources blogs and forums from role fumanchu", async function () {
            const acl = new Acl(backend);

            await acl.removeAllow("fumanchu", ["blogs", "forums"], "get");
        });

        it("Remove delete and put permissions from resource news from role fumanchu", async function () {
            const acl = new Acl(backend);

            await acl.removeAllow("fumanchu", "news", "delete");
        });

        it("Remove view permissions from resource blogs from role bar", async function () {
            const acl = new Acl(backend);

            await acl.removeAllow("bar", "blogs", "view");
        });
    });

    describe("See if permissions were removed", function () {
        it('What resources have "fumanchu" some rights on after removed some of them?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("fumanchu");

            assert(!("blogs" in resources));
            assert(resources.news);
            assert(resources.news.includes("get"));
            assert(resources.news.includes("put"));
            assert(!("delete" in resources.news));

            assert(resources.forums);
            assert(resources.forums.includes("delete"));
            assert(resources.forums.includes("put"));
        });
    });

    describe("removeRole", function () {
        it("Remove role fumanchu", async function () {
            const acl = new Acl(backend);

            await acl.removeRole("fumanchu");
        });

        it("Remove role member", async function () {
            const acl = new Acl(backend);

            await acl.removeRole("member");
        });

        it("Remove role foo", async function () {
            const acl = new Acl(backend);

            await acl.removeRole("foo");
        });
    });

    describe("Was role removed?", function () {
        it('What resources have "fumanchu" some rights on after removed?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("fumanchu");

            assert(Object.keys(resources).length === 0);
        });

        it('What resources have "member" some rights on after removed?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("member");

            assert(Object.keys(resources).length === 0);
        });

        describe("allowed permissions", function () {
            it("What permissions has jsmith over blogs and forums?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("jsmith", ["blogs", "forums"]);

                assert(permissions.blogs.length === 0);
                assert(permissions.forums.length === 0);
            });

            it("What permissions has test@test.com over blogs and forums?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("test@test.com", ["blogs", "forums"]);

                assert(permissions.blogs.length === 0);
                assert(permissions.forums.length === 0);
            });

            it("What permissions has james over blogs?", async function () {
                const acl = new Acl(backend);

                const permissions = await acl.allowedPermissions("james", "blogs");

                assert(permissions.blogs);
                assert(permissions.blogs.includes("delete"));
            });
        });
    });

    describe("RoleParentRemoval", function () {
        before(async function () {
            const acl = new Acl(backend);

            await acl.allow("parent1", "x", "read1");
            await acl.allow("parent2", "x", "read2");
            await acl.allow("parent3", "x", "read3");
            await acl.allow("parent4", "x", "read4");
            await acl.allow("parent5", "x", "read5");

            await acl.addRoleParents("child", ["parent1", "parent2", "parent3", "parent4", "parent5"]);
        });

        let acl;

        beforeEach(function () {
            acl = new Acl(backend);
        });

        it("Environment check", async function () {
            const resources = await acl.whatResources("child");

            assert.equal(resources.x.length, 5);
            assert(resources.x.includes("read1"));
            assert(resources.x.includes("read2"));
            assert(resources.x.includes("read3"));
            assert(resources.x.includes("read4"));
            assert(resources.x.includes("read5"));
        });

        it("Operation removing a specific parent role", async function () {
            await acl.removeRoleParents("child", "parentX");
        });

        it("Operation removing multiple specific parent roles", async function () {
            await acl.removeRoleParents("child", ["parentX", "parentY"]);
        });

        it('Remove parent role "parentX" from role "child"', async function () {
            await acl.removeRoleParents("child", "parentX");

            let resources = await acl.whatResources("child");

            assert.equal(resources.x.length, 5);
            assert(resources.x.includes("read1"));
            assert(resources.x.includes("read2"));
            assert(resources.x.includes("read3"));
            assert(resources.x.includes("read4"));
            assert(resources.x.includes("read5"));
        });

        it('Remove parent role "parent1" from role "child"', async function () {
            await acl.removeRoleParents("child", "parent1");

            let resources = await acl.whatResources("child");

            assert.equal(resources.x.length, 4);
            assert(resources.x.includes("read2"));
            assert(resources.x.includes("read3"));
            assert(resources.x.includes("read4"));
            assert(resources.x.includes("read5"));
        });

        it('Remove parent roles "parent2" & "parent3" from role "child"', async function () {
            await acl.removeRoleParents("child", ["parent2", "parent3"]);

            let resources = await acl.whatResources("child");

            assert.equal(resources.x.length, 2);
            assert(resources.x.includes("read4"));
            assert(resources.x.includes("read5"));
        });

        it('Remove all parent roles from role "child"', async function () {
            await acl.removeRoleParents("child");

            let resources = await acl.whatResources("child");

            assert(!resources.x);
        });

        it('Remove all parent roles from role "child" with no parents', async function () {
            await acl.removeRoleParents("child");

            let resources = await acl.whatResources("child");

            assert(!resources.x);
        });

        it('Remove parent role "parent1" from role "child" with no parents', async function () {
            await acl.removeRoleParents("child", "parent1");

            let resources = await acl.whatResources("child");

            assert(!resources.x);
        });

        it("Operation removing all parent roles", async function () {
            await acl.removeRoleParents("child");
        });
    });

    describe("removeResource", function () {
        it("Remove resource blogs", async function () {
            const acl = new Acl(backend);

            await acl.removeResource("blogs");
        });

        it("Remove resource users", async function () {
            const acl = new Acl(backend);

            await acl.removeResource("users");
        });
    });

    describe("allowedPermissions", function () {
        it("What permissions has james over blogs?", async function () {
            const acl = new Acl(backend);

            const permissions = await acl.allowedPermissions("james", "blogs");

            assert(permissions.blogs);
            assert(permissions.blogs.length === 0);
        });

        it("What permissions has userId=4 over blogs?", async function () {
            const acl = new Acl(backend);

            const permissions = await acl.allowedPermissions("4", "blogs");

            assert(permissions.blogs);
            assert(permissions.blogs.length === 0);
        });
    });

    describe("whatResources", function () {
        it('What resources have "baz" some rights on after removed blogs?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("baz");

            assert(_.isPlainObject(resources));
            assert(Object.keys(resources).length === 0);
        });

        it('What resources have "admin" some rights on after removed users resource?', async function () {
            const acl = new Acl(backend);

            const resources = await acl.whatResources("admin");

            assert(!("users" in resources));
            assert(!("blogs" in resources));
        });
    });

    describe("Remove user roles", function () {
        it("Remove role guest from joed", async function () {
            const acl = new Acl(backend);

            await acl.removeUserRoles("joed", "guest");
        });

        it("Remove role guest from userId=0", async function () {
            const acl = new Acl(backend);

            await acl.removeUserRoles("0", "guest");
        });
        it("Remove role admin from harry", async function () {
            const acl = new Acl(backend);

            await acl.removeUserRoles("harry", "admin");
        });

        it("Remove role admin from userId=2", async function () {
            const acl = new Acl(backend);

            await acl.removeUserRoles("2", "admin");
        });
    });

    describe("Were roles removed?", function () {
        it("What permissions has harry over forums and blogs?", async function () {
            const acl = new Acl(backend);

            const permissions = await acl.allowedPermissions("harry", ["forums", "blogs"]);

            assert(_.isPlainObject(permissions));
            assert(permissions.forums.length === 0);
        });

        it("What permissions has userId=2 over forums and blogs?", async function () {
            const acl = new Acl(backend);

            const permissions = await acl.allowedPermissions("2", ["forums", "blogs"]);

            assert(_.isPlainObject(permissions));
            assert(permissions.forums.length === 0);
        });
    });

    describe("Github issue #55: removeAllow is removing all permissions.", function () {
        it("Add roles/resources/permissions", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("jannette", "member");
            await acl.allow("member", "blogs", ["view", "update"]);
            assert(await acl.isAllowed("jannette", "blogs", "view"));

            await acl.removeAllow("member", "blogs", "update");
            assert(await acl.isAllowed("jannette", "blogs", "view"));

            assert(!(await acl.isAllowed("jannette", "blogs", "update")));

            await acl.removeAllow("member", "blogs", "view");
            assert(!(await acl.isAllowed("jannette", "blogs", "view")));
        });
    });

    describe('Github issue #32: Removing a role removes the entire "allows" document.', function () {
        it("Add roles/resources/permissions", async function () {
            const acl = new Acl(backend);

            await acl.allow(["role1", "role2", "role3"], ["res1", "res2", "res3"], ["perm1", "perm2", "perm3"]);
        });

        it("Add user roles and parent roles", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("user1", "role1");

            await acl.addRoleParents("role1", "parentRole1");
        });

        it("Add user roles and parent roles", async function () {
            const acl = new Acl(backend);

            await acl.addUserRoles("1", "role1");

            await acl.addRoleParents("role1", "parentRole1");
        });

        it("Verify that roles have permissions as assigned", async function () {
            const acl = new Acl(backend);

            let res = await acl.whatResources("role1");
            assert.deepEqual(res.res1.sort(), ["perm1", "perm2", "perm3"]);

            res = await acl.whatResources("role2");
            assert.deepEqual(res.res1.sort(), ["perm1", "perm2", "perm3"]);
        });

        it('Remove role "role1"', async function () {
            const acl = new Acl(backend);

            await acl.removeRole("role1");
        });

        it('Verify that "role1" has no permissions and "role2" has permissions intact', async function () {
            const acl = new Acl(backend);

            await acl.removeRole("role1");

            let res = await acl.whatResources("role1");
            assert(Object.keys(res).length === 0);

            res = await acl.whatResources("role2");
            assert.deepEqual(res.res1.sort(), ["perm1", "perm2", "perm3"]);
        });
    });
});
