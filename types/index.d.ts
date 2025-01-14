declare module "acl2" {
  import { Db } from "mongodb";
  interface RolePermission {
    roles: string | string[];
    allows: {
      resources: string | string[];
      permissions: string | string[];
    }[];
  }

  class Acl {
    constructor(backend: Acl.MongoBackend);

    allow(rolesPermissions: RolePermission[] | string, resources?: string | string[], permissions?: string | string[]): Promise<void>;

    addUserRoles(userId: string, roles: string | string[]): Promise<void>;

    removeUserRoles(userId: string, roles: string | string[]): Promise<void>;

    userRoles(userId: string): Promise<string[]>;

    hasRole(userId: string, role: string): Promise<boolean>;

    addRoleParents(role: string, parents: string | string[]): Promise<void>;

    removeRoleParents(role: string, parents: string | string[]): Promise<void>;

    whatResources(roles: string | string[]): Promise<Record<string, string[]>>;

    isAllowed(userId: string, resources: string | string[], permissions: string | string[]): Promise<boolean>;

    areAnyRolesAllowed(roles: string | string[], resources: string | string[], permissions: string | string[]): Promise<boolean>;

    removeResource(resource: string | string[]): Promise<void>;
    removeRole(role: string): Promise<void>;

    middleware(
      numPathComponents?: number,
      userId?: (req: any) => string,
      actions?: string | string[]
    ): (req: any, res: any, next: (err?: any) => void) => void;

    removeAllow(role: string, resources: string | string[], permissions?: string | string[]): Promise<void>;

  }

  namespace Acl {
    interface MongoBackend {
      new (db: Db, prefix: string): Acl;
    }

    interface Backend {
      new (db: Db, prefix: string): Backend;
    }

    function mongodbBackend(db: Db, prefix: string): void;

    // Memory Backend
    function memoryBackend(): Backend;

    // Redis Backend
    function redisBackend(client: any, prefix: string): Backend;
  }

  // Export the ACL class for use
  export = Acl;
}

