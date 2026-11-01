const { parseProblemDocument, parseQuizQuestions } = require('./services/documentImport');

console.log('=== TEST 1: CSES Apartments Problem ===');
const problemText = `Apartments
There are n applicants and m free apartments. Your task is to distribute the apartments so that as many applicants as possible will get an apartment.
Each applicant has a desired apartment size, and they will accept any apartment whose size is close enough to the desired size.

Input
The first input line has three integers n, m, and k: the number of applicants, the number of apartments, and the maximum allowed difference. The next line contains n integers a1, a2, ..., an: the desired apartment size of each applicant. If the desired size of an applicant is x, they will accept any apartment whose size is between x-k and x+k. The last line contains m integers b1, b2, ..., bm: the size of each apartment.

Output
Print one integer: the number of applicants who will get an apartment.

Constraints
• 1 <= n, m <= 2*10^5
• 0 <= k <= 10^9
• 1 <= ai, bi <= 10^9

Example 1
Input
4 3 5
60 45 80 60
30 60 75
Output
2
`;

console.log(JSON.stringify(parseProblemDocument(problemText), null, 2));

console.log('\n=== TEST 2: Quiz with various formats ===');
const quizText = `1. What is the time complexity of binary search?
A) O(n)
B) O(log n)
C) O(n^2)
D) O(1)
Answer: B

Q2: Which data structure uses LIFO?
(A) Queue
(B) Stack
(C) Tree
(D) Graph
Ans - B

3) In C++, which operator is used for dynamic memory allocation?
A. malloc  B. new  C. alloc  D. create
Correct Answer: B
`;

console.log(JSON.stringify(parseQuizQuestions(quizText), null, 2));

