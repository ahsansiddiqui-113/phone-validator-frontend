import React, { useState } from 'react';

function PhoneForm({ onValidate }) {
  const [phone, setPhone] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim() === '') return;
    onValidate(phone);
  };

  return (
    <form onSubmit={handleSubmit} className="form">
      <input
        type="text"
        placeholder="Enter phone number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="input"
      />
      <button type="submit" className="button">
        Validate
      </button>
    </form>
  );
}

export default PhoneForm;
