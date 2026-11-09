import {
  GraphQLEnumType,
  GraphQLBoolean,
  GraphQLError,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} from 'graphql';

const CatalogStatus = new GraphQLEnumType({
  name: 'CatalogStatus',
  values: { AVAILABLE: {}, UNAVAILABLE: {} }
});

const CatalogProduct = new GraphQLObjectType({
  name: 'CatalogProduct',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    category: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) }
  }
});

const OrderLine = new GraphQLObjectType({
  name: 'OrderLine',
  fields: {
    productId: { type: new GraphQLNonNull(GraphQLID) },
    quantity: { type: new GraphQLNonNull(GraphQLInt) },
    unitPrice: { type: new GraphQLNonNull(GraphQLInt) },
    lineTotal: { type: new GraphQLNonNull(GraphQLInt) },
    product: {
      type: CatalogProduct,
      resolve: (line, _args, context) => line.catalogProductMap?.get(String(line.productId)) || null
    }
  }
});

const PageInfo = new GraphQLObjectType({
  name: 'PageInfo',
  fields: {
    endCursor: { type: GraphQLString },
    hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
});

const OrderEvent = new GraphQLObjectType({
  name: 'OrderEvent',
  fields: {
    status: { type: new GraphQLNonNull(GraphQLString) },
    at: { type: new GraphQLNonNull(GraphQLString) }
  }
});

const OrderLineConnection = new GraphQLObjectType({
  name: 'OrderLineConnection',
  fields: {
    nodes: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(OrderLine))) },
    totalCount: { type: new GraphQLNonNull(GraphQLInt) },
    pageInfo: { type: new GraphQLNonNull(PageInfo) }
  }
});

function decodeCursor(cursor, orderId) {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const safeOrderId = String(orderId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = decoded.match(new RegExp(`^line:${safeOrderId}:(\\d+)$`));
    if (!match || Buffer.from(decoded).toString('base64url') !== cursor) throw new Error('invalid cursor');
    return Number(match[1]);
  } catch {
    throw new GraphQLError('El cursor de líneas no es válido para este pedido.', { extensions: { code: 'BAD_CURSOR' } });
  }
}

const OrderSummary = new GraphQLObjectType({
  name: 'OrderSummary',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    status: { type: new GraphQLNonNull(GraphQLString) },
    fulfillment: { type: new GraphQLNonNull(GraphQLString) },
    total: { type: new GraphQLNonNull(GraphQLInt) },
    currency: { type: new GraphQLNonNull(GraphQLString) },
    timeline: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(OrderEvent))) },
    catalogStatus: {
      type: CatalogStatus,
      resolve: order => {
        if (order.catalogUnavailable) {
          throw new GraphQLError('El resumen del pedido está disponible; algunas fichas públicas actuales no se pudieron recuperar.', { extensions: { code: 'CATALOG_PARTIAL' } });
        }
        return 'AVAILABLE';
      }
    },
    items: {
      type: new GraphQLNonNull(OrderLineConnection),
      args: {
        first: { type: GraphQLInt, defaultValue: 10 },
        after: { type: GraphQLString }
      },
      resolve: (order, { first = 10, after }) => {
        if (!Number.isInteger(first) || first < 1 || first > 20) {
          throw new GraphQLError('first debe estar entre 1 y 20.', { extensions: { code: 'PAGE_SIZE_OUT_OF_RANGE' } });
        }
        const offset = decodeCursor(after, order.id);
        if (offset > order.items.length) {
          throw new GraphQLError('El cursor no corresponde a este conjunto de líneas.', { extensions: { code: 'BAD_CURSOR' } });
        }
        const nodes = order.items.slice(offset, offset + first);
        const next = offset + nodes.length;
        return {
          nodes,
          totalCount: order.items.length,
          pageInfo: {
            endCursor: next < order.items.length ? Buffer.from(`line:${order.id}:${next}`).toString('base64url') : null,
            hasNextPage: next < order.items.length
          }
        };
      }
    }
  }
});

export const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      myOrderSummary: {
        type: OrderSummary,
        args: { orderId: { type: new GraphQLNonNull(GraphQLID) } },
        resolve: (_source, { orderId }, context) => context.loadOwnOrder(String(orderId))
      }
    }
  })
});
