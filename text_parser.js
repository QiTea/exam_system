const fs = require('fs');

function parseExamText(text) {
    const questions = [];
    
    // 预处理文本，统一换行符
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');
    
    let currentQuestionLines = [];
    let expectedQuestionId = 1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 检查行首是否为连续的数字
        if (/^\d+$/.test(line)) {
            const questionId = parseInt(line);
            
            // 如果是期望的连续数字
            if (questionId === expectedQuestionId) {
                // 处理上一题（如果存在）
                if (currentQuestionLines.length > 0) {
                    const question = parseQuestionBlock(currentQuestionLines, expectedQuestionId - 1);
                    if (question) {
                        questions.push(question);
                    }
                }
                
                // 开始新题
                currentQuestionLines = [line];
                expectedQuestionId = questionId + 1;
            } else {
                // 如果不是连续数字，将其作为普通内容处理
                currentQuestionLines.push(line);
            }
        } else {
            // 普通内容行
            currentQuestionLines.push(line);
        }
    }
    
    // 处理最后一题
    if (currentQuestionLines.length > 0) {
        const question = parseQuestionBlock(currentQuestionLines, expectedQuestionId - 1);
        if (question) {
            questions.push(question);
        }
    }
    
    return questions;
}

function parseQuestionBlock(lines, questionId) {
    const blockText = lines.join('\n');
    
    try {
        // 提取问题内容
        const questionMatch = blockText.match(/问题：\s*\n([\s\S]*?)(?=\n选项：)/);
        if (!questionMatch) {
            console.log(`警告: 题目 ${questionId} 未找到问题内容`);
            return null;
        }
        const questionText = questionMatch[1].trim();
        
        // 提取选项
        const options = [];
        const optionsMatch = blockText.match(/选项：\s*\n([\s\S]*?)(?=\n.*?正确答案：)/);
        if (optionsMatch) {
            const optionsText = optionsMatch[1];
            
            // 使用正则表达式按选项字母（A、B、C、D等）分割
            // 匹配以A.、B.、C.、D.、E.等开头的选项
            const optionMatches = optionsText.match(/[A-E]\.\s*[\s\S]*?(?=\n[A-E]\.|$)/g);
            
            if (optionMatches) {
                for (let option of optionMatches) {
                    // 移除选项标识符（如A.、B.等）并清理文本
                    const optionText = option.replace(/^[A-E]\.\s*/, '').trim();
                    if (optionText) {
                        options.push(optionText);
                    }
                }
            }
        }
        
        // 提取正确答案
        const answerMatch = blockText.match(/正确答案：([A-E,\s]+)/);
        if (!answerMatch) {
            console.log(`警告: 题目 ${questionId} 未找到正确答案`);
            return null;
        }
        // 处理多个答案，去除空格并分割，支持逗号分隔的多选答案
        const answerString = answerMatch[1].replace(/\s/g, '');
        const answer = answerString.includes(',') ? answerString.split(',').filter(a => a.length > 0) : [answerString];
        
        // 提取解释
        const explanationMatch = blockText.match(/解释：\s*\n([\s\S]*?)$/);
        const explanation = explanationMatch ? explanationMatch[1].trim() : "";
        
        return {
            id: questionId,
            question: questionText,
            options: options,
            answer: answer,
            explanation: explanation
        };
        
    } catch (error) {
        console.log(`错误: 解析题目 ${questionId} 时出现问题:`, error.message);
        return null;
    }
}

// 主处理函数
function processTextFile(inputFile, outputFile) {
    fs.readFile(inputFile, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件错误:', err);
            return;
        }
        
        console.log('开始解析文件...');
        console.log('按行首连续数字进行分割...');
        
        const questions = parseExamText(data);
        
        console.log(`\n解析完成! 成功处理 ${questions.length} 道题目`);
        
        // 验证题目连续性
        let hasGaps = false;
        for (let i = 0; i < questions.length; i++) {
            const expectedId = i + 1;
            if (questions[i].id !== expectedId) {
                console.log(`警告: 题目编号不连续，期望 ${expectedId}，实际 ${questions[i].id}`);
                hasGaps = true;
            }
        }
        
        if (!hasGaps) {
            console.log('✓ 题目编号连续性检查通过');
        }
        
        // 详细解析结果
        questions.forEach(q => {
            console.log(`题目 ${q.id}: 选项 ${q.options.length} 个, 答案 ${q.answer}, 解释 ${q.explanation ? '有' : '无'}`);
        });
        
        // 保存为JSON文件
        fs.writeFile(outputFile, JSON.stringify(questions, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('写入文件错误:', err);
                return;
            }
            
            console.log(`\n结果已保存到: ${outputFile}`);
            
            // // 显示第一题作为示例
            // if (questions.length > 0) {
            //     console.log('\n=== 示例输出（第一题） ===');
            //     console.log(JSON.stringify(questions[0], null, 2));
            // }
        });
    });
}

// 使用示例
const inputFileName = 'exam_questions.txt';
const outputFileName = 'exam_questions.json';

console.log('AWS考试题目解析器');
console.log('===================');
console.log(`输入文件: ${inputFileName}`);
console.log(`输出文件: ${outputFileName}`);
console.log('');

processTextFile(inputFileName, outputFileName);