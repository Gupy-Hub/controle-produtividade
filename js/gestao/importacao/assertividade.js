/**
 * ARQUIVO: gupy-hub/controle-produtividade/.../js/gestao/importacao/assertividade.js
 * ALTERAÇÃO: Ajuste na leitura da coluna 'porcentagem' para permitir valores nulos.
 */

window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo CSV gigante...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                return header.trim().replace(/"/g, '').toLowerCase();
            },
            complete: async (results) => {
                if (results.data.length === 0) {
                    alert("Arquivo vazio.");
                    if(statusEl) statusEl.innerText = "";
                    return;
                }
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro leitura: " + err.message);
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;
        const TAMANHO_LOTE = 1000; 

        if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-filter"></i> Processando dados...</span>`;
        await new Promise(r => setTimeout(r, 50));

        const dadosFormatados = linhas.map(linha => {
            // 1. DATA
            let valData = linha['end_time']; 
            if (!valData) return null; 

            let dataFormatada = null;
            let apenasData = valData.split('T')[0].split(' ')[0];
            if (apenasData.includes('/')) {
                const partes = apenasData.split('/'); 
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } else if (apenasData.includes('-')) {
                dataFormatada = apenasData; 
            }
            if (!dataFormatada) return null;

            // 2. ID DO USUÁRIO
            let idAssistente = linha['id_assistente'] || linha['id assistente'];
            let usuarioIdFinal = null;
            if (idAssistente) {
                usuarioIdFinal = parseInt(idAssistente.toString().replace(/\D/g, ''));
            }

            // 3. Tratamento da Porcentagem (Assertividade)
            // LÓGICA CORRIGIDA: Se tiver valor, usa o valor. Se for vazio, usa null.
            let rawPorcentagem = linha['% assert'] || linha['assertividade'];
            let porcentagemFinal = null;

            if (rawPorcentagem && rawPorcentagem.trim() !== '') {
                porcentagemFinal = rawPorcentagem.trim();
            }
            // Nota: Removemos o "|| '0%'" para garantir que vazios sejam NULL

            const idEmpresa = linha['company_id'] || linha['company id'] || '0';
            const nomeEmpresa = linha['empresa'] || linha['nome da ppc'] || 'Empresa não informada';
            const statusFinal = linha['status'] || 'PROCESSADO';

            return {
                data_auditoria: dataFormatada,
                company_id: idEmpresa.toString().trim(),
                empresa: nomeEmpresa.trim(),
                
                usuario_id: usuarioIdFinal || null, 
                assistente: linha['assistente'] || 'Desconhecido',
                
                doc_name: linha['doc_name'] || linha['documento'] || linha['nome_documento'] || '-',
                status: statusFinal, 
                obs: (linha['apontamentos/obs'] || linha['obs'] || ''),
                campos: parseInt(linha['nº campos']) || 0,
                ok: parseInt(linha['ok']) || 0,
                nok: parseInt(linha['nok']) || 0,
                porcentagem: porcentagemFinal, // Agora aceita NULL
                auditora: linha['auditora'] || 'Sistema'
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        if (total === 0) {
            alert("Nenhum registro válido. Verifique coluna 'end_time' e 'id_assistente'.");
            return;
        }

        // 3. LIMPEZA SEGURA
        if(statusEl) statusEl.innerHTML = `<span class="text-amber-600"><i class="fas fa-eraser"></i> Limpando período (Anti-Duplicidade)...</span>`;
        await new Promise(r => setTimeout(r, 50));
        
        const datasParaLimpar = [...new Set(dadosFormatados.map(d => d.data_auditoria))];
        
        try {
            await Sistema.supabase.from('assertividade').delete().in('data_auditoria', datasParaLimpar);
        } catch (e) {
            console.error(e);
            alert("Erro ao limpar dados antigos.");
            return;
        }

        // 4. INSERÇÃO MASSIVA
        if(statusEl) statusEl.innerHTML = `<span class="text-orange-500 font-bold">Enviando ${total} registros...</span>`;

        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }

            if (statusEl) {
                const percentual = Math.round(((i + lote.length) / total) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-upload"></i> Importando: ${percentual}%</span>`;
            }
        }

        // 5. FIM
        setTimeout(() => {
            alert(`Importação de ${sucesso} registros concluída!\nAgora os IDs estão conectados.`);
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
        }, 500);
    }
};