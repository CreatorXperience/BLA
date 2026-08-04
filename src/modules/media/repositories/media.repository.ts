import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma";
import type { MediaQuery } from "../validators/media.schema";

export class MediaRepository {
  create(data: Prisma.MediaAssetCreateInput) {
    return prisma.mediaAsset.create({ data });
  }

  findById(id: string) {
    return prisma.mediaAsset.findUnique({ where: { id } });
  }

  async list(query: MediaQuery) {
    const where: Prisma.MediaAssetWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.folder ? { folder: query.folder } : {}),
      ...(query.q
        ? { OR: [{ filename: { contains: query.q, mode: "insensitive" as const } }, { originalName: { contains: query.q, mode: "insensitive" as const } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.mediaAsset.count({ where }),
    ]);
    return { data, total, page: query.page, perPage: query.perPage };
  }

  delete(id: string) {
    return prisma.mediaAsset.delete({ where: { id } });
  }

  update(id: string, data: Prisma.MediaAssetUpdateInput) {
    return prisma.mediaAsset.update({ where: { id }, data });
  }

  async listFolders() {
    const result = await prisma.mediaAsset.groupBy({ by: ["folder"], _count: { _all: true } });
    return result.map((r) => ({ folder: r.folder, count: r._count._all }));
  }
}

export const mediaRepository = new MediaRepository();
