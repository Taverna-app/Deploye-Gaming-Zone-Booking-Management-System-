export const ok = (res, data, message = 'OK', status = 200) => res.status(status).json({ success: true, data, message });
export const created = (res, data, message = 'Created') => ok(res, data, message, 201);
export const paginated = (res, data, pagination) => res.status(200).json({ success: true, data, pagination });
//# sourceMappingURL=response.js.map