import { z } from 'zod';
import { insertUserSchema, insertProductSchema, products, users, orders, deliveries } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  })
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({ email: z.string(), password: z.string() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    },
    register: {
      method: 'POST' as const,
      path: '/api/auth/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      }
    }
  },
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/products' as const,
      input: z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        supplierId: z.coerce.number().optional()
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect & { supplier: { id: number, name: string } }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/products/:id' as const,
      responses: {
        200: z.custom<typeof products.$inferSelect & { supplier: { id: number, name: string } }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/products' as const,
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/products/:id' as const,
      input: insertProductSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/products/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      }
    }
  },
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders' as const,
      responses: {
        200: z.array(z.custom<any>()), // OrderWithDetails
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/orders/:id' as const,
      responses: {
        200: z.custom<any>(), // OrderWithDetails
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/orders' as const,
      input: z.object({
        items: z.array(z.object({
          listingId: z.number(),
          productId: z.number(),
          supplierId: z.number(),
          supplierName: z.string(),
          flavorId: z.number().nullable().optional(),
          sizeId: z.number().nullable().optional(),
          flavorName: z.string().nullable().optional(),
          sizeName: z.string().nullable().optional(),
          quantity: z.number().min(1),
          unitPrice: z.number().min(0),
        }))
      }),
      responses: {
        201: z.custom<typeof orders.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/orders/:id/status' as const,
      input: z.object({
        status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED']),
        deliveryId: z.number().optional()
      }),
      responses: {
        200: z.custom<typeof orders.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      }
    }
  },
  deliveries: {
    list: {
      method: 'GET' as const,
      path: '/api/deliveries' as const,
      responses: {
        200: z.array(z.custom<any>()), // DeliveryWithDetails[]
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/deliveries/:id' as const,
      responses: {
        200: z.custom<any>(), // DeliveryWithDetails
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/deliveries' as const,
      input: z.object({ subOrderId: z.number() }),
      responses: {
        201: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      }
    },
    dispatch: {
      method: 'PATCH' as const,
      path: '/api/deliveries/:id/dispatch' as const,
      input: z.object({ mode: z.enum(['DELIVERY_COMPANY', 'SUPPLIER']) }),
      responses: {
        200: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      }
    },
    accept: {
      method: 'PATCH' as const,
      path: '/api/deliveries/:id/accept' as const,
      responses: {
        200: z.custom<typeof deliveries.$inferSelect>(),
        409: errorSchemas.validation,
      }
    },
    assign: {
      method: 'PATCH' as const,
      path: '/api/deliveries/:id/assign' as const,
      input: z.object({ driverId: z.number() }),
      responses: {
        200: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      }
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/deliveries/:id/status' as const,
      input: z.object({
        status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
      }),
      responses: {
        200: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      }
    },
  },
  deliveryCompanyDrivers: {
    list: {
      method: 'GET' as const,
      path: '/api/delivery-company/drivers' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/delivery-company/drivers' as const,
      input: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional().nullable(),
      }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
  },
  supplierDrivers: {
    list: {
      method: 'GET' as const,
      path: '/api/supplier/drivers' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/supplier/drivers' as const,
      input: z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional().nullable(),
      }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
