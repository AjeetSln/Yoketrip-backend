const Joi = require('joi');

const validateTransaction = (data) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
    description: Joi.string().max(255),
    type: Joi.string().valid('deposit', 'withdrawal', 'transfer', 'payment'),
    reference: Joi.string()
  });

  return schema.validate(data);
};

const validateWithdrawal = (data) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
    method: Joi.string().valid('upi', 'bank').required(),
    upiId: Joi.when('method', {
      is: 'upi',
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    }),
    accountNumber: Joi.when('method', {
      is: 'bank',
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    }),
    ifscCode: Joi.when('method', {
      is: 'bank',
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    })
  });

  return schema.validate(data);
};

module.exports = {
  validateTransaction,
  validateWithdrawal
};
