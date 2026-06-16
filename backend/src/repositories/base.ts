/**
 * BaseRepository - 数据访问层基类
 * 提供 D1 数据库的通用 CRUD 操作
 */

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class BaseRepository<T extends Record<string, any>> {
  constructor(
    protected db: D1Database,
    protected tableName: string
  ) {}

  /**
   * 根据 ID 查询单条记录
   */
  async findById(id: number): Promise<T | null> {
    const result = await this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .bind(id)
      .first<T>();

    return result ?? null;
  }

  /**
   * 根据条件查询单条记录
   */
  async findOne(where: Record<string, any>): Promise<T | null> {
    const { clause, binds } = this.buildWhereClause(where);

    const result = await this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE ${clause} LIMIT 1`)
      .bind(...binds)
      .first<T>();

    return result ?? null;
  }

  /**
   * 查询多条记录（根据条件）
   */
  async findMany(
    where?: Record<string, any>,
    options?: {
      orderBy?: string;
      order?: 'ASC' | 'DESC';
      limit?: number;
      offset?: number;
    }
  ): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const binds: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const { clause, binds: whereBinds } = this.buildWhereClause(where);
      sql += ` WHERE ${clause}`;
      binds.push(...whereBinds);
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.order ?? 'DESC'}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      binds.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET ?`;
      binds.push(options.offset);
    }

    const { results } = await this.db.prepare(sql).bind(...binds).all<T>();
    return results;
  }

  /**
   * 分页查询
   */
  async paginate(
    page: number = 1,
    pageSize: number = 20,
    where?: Record<string, any>,
    orderBy?: string,
    order: 'ASC' | 'DESC' = 'DESC'
  ): Promise<PaginationResult<T>> {
    const offset = (page - 1) * pageSize;
    const binds: any[] = [];

    let whereSql = '';
    if (where && Object.keys(where).length > 0) {
      const { clause, binds: whereBinds } = this.buildWhereClause(where);
      whereSql = ` WHERE ${clause}`;
      binds.push(...whereBinds);
    }

    // 查询总数
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as total FROM ${this.tableName}${whereSql}`)
      .bind(...binds)
      .first<{ total: number }>();

    const total = countResult?.total ?? 0;

    // 查询数据
    let dataSql = `SELECT * FROM ${this.tableName}${whereSql}`;
    if (orderBy) {
      dataSql += ` ORDER BY ${orderBy} ${order}`;
    }
    dataSql += ` LIMIT ? OFFSET ?`;

    const { results } = await this.db
      .prepare(dataSql)
      .bind(...binds, pageSize, offset)
      .all<T>();

    return {
      items: results,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 插入记录
   */
  async insert(data: Record<string, any>): Promise<number> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => data[k]);

    const result = await this.db
      .prepare(`INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`)
      .bind(...values)
      .run();

    return result.meta.last_row_id as number;
  }

  /**
   * 根据 ID 更新记录
   */
  async updateById(id: number, data: Record<string, any>): Promise<void> {
    const keys = Object.keys(data);
    if (keys.length === 0) return;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => data[k]);

    await this.db
      .prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  /**
   * 根据条件更新
   */
  async updateWhere(where: Record<string, any>, data: Record<string, any>): Promise<void> {
    const keys = Object.keys(data);
    if (keys.length === 0) return;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const setValues = keys.map((k) => data[k]);

    const { clause, binds } = this.buildWhereClause(where);

    await this.db
      .prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE ${clause}`)
      .bind(...setValues, ...binds)
      .run();
  }

  /**
   * 根据 ID 删除记录
   */
  async deleteById(id: number): Promise<void> {
    await this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).bind(id).run();
  }

  /**
   * 根据条件删除
   */
  async deleteWhere(where: Record<string, any>): Promise<void> {
    const { clause, binds } = this.buildWhereClause(where);
    await this.db.prepare(`DELETE FROM ${this.tableName} WHERE ${clause}`).bind(...binds).run();
  }

  /**
   * 统计记录数
   */
  async count(where?: Record<string, any>): Promise<number> {
    let sql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
    const binds: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const { clause, binds: whereBinds } = this.buildWhereClause(where);
      sql += ` WHERE ${clause}`;
      binds.push(...whereBinds);
    }

    const result = await this.db.prepare(sql).bind(...binds).first<{ total: number }>();
    return result?.total ?? 0;
  }

  /**
   * 执行原始 SQL 查询
   */
  async raw<R = T>(sql: string, ...binds: any[]): Promise<R[]> {
    const { results } = await this.db.prepare(sql).bind(...binds).all<R>();
    return results;
  }

  /**
   * 构建 WHERE 子句
   */
  protected buildWhereClause(where: Record<string, any>): { clause: string; binds: any[] } {
    const clauses: string[] = [];
    const binds: any[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        clauses.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        clauses.push(`${key} IN (${placeholders})`);
        binds.push(...value);
      } else {
        clauses.push(`${key} = ?`);
        binds.push(value);
      }
    }

    return {
      clause: clauses.join(' AND '),
      binds,
    };
  }
}
