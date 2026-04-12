// test-key.js
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

console.log('Key length:', privateKey?.length || 0);
console.log('Has BEGIN:', privateKey?.includes('BEGIN PRIVATE KEY') || false);
console.log('Has END:', privateKey?.includes('END PRIVATE KEY') || false);
console.log('First 50 chars:', privateKey?.substring(0, 50));
console.log('Last 50 chars:', privateKey?.substring(privateKey.length - 50));

// Check if it looks like a real key (should be long)
if (privateKey && privateKey.length < 500) {
  console.log('\n⚠️  WARNING: Key is too short! Should be ~1700+ characters.');
  console.log('The key was likely truncated when pasted.');
}
