window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    // Configurações de Performance
    BATCH_SIZE: 500,        // Tamanho ideal para não travar o banco
    CONCURRENCY_LIMIT: 3,   // Requisições simultâneas

    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // --- 1. CAPTURA O BOTÃO PARA DAR FEEDBACK ---
        // O input está dentro da label (que é o botão visual), então pegamos o pai
        const btn = input.parentElement;
        const originalHtml = btn.innerHTML;
        const originalClass = btn.className;

        // Função interna para atualizar o texto do botão
        const atualizarBotao = (texto, icone = 'fa-circle-notch fa-spin') => {
            btn.innerHTML = `<i class="fas ${icone}"></i> ${texto}`;
            // Mantém o input dentro para não quebrar a referência, mas oculto
            btn.appendChild(input); 
        };

        // Trava o botão visualmente
        btn.classList.add('opacity-75', 'cursor-not-allowed', 'pointer-events-none');
        atualizarBotao("Lendo arquivo...");

        try {
            await new Promise(r => setTimeout(r, 50)); // Pequeno delay para a UI renderizar

            // --- 2. CARREGA DADOS AUXILIARES (CACHE) ---
            const [resUsers, resEmpresas] = await Promise.all([
                Sistema.supabase.from('usuarios').select('id, nome'),
                Sistema.supabase.from('empresas').select('id, nome, subdominio')
            ]);

            if(resUsers.error) throw resUsers.error;
            if(resEmpresas.error) throw resEmpresas.error;

            // Mapas para busca rápida O(1)
            const mapUsuariosID = new Map(resUsers.data.map(u => [u.id, u.id]));
            const mapUsuariosNome = new Map(resUsers.data.map(u => [this.normalizar(u.nome), u.id]));
            
            const mapEmpresas = new Map();
            resEmpresas.data.forEach(e => {
                const info = { id: e.id, nome: e.nome };
                mapEmpresas.set(this.normalizar(e.nome), info);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), info);
            });

            // --- 3. PROCESSAMENTO DO ARQUIVO ---
            const linhas = await Gestao.lerArquivo(file);
            atualizarBotao(`Processando ${linhas.length}...`);

            const inserts = [];
            const logErros = new Set();
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };

            // Loop de transformação
            for (const [index, row] of linhas.entries()) {
                const c = {};
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // Identifica Usuário
                let usuarioId = null;
                let rawId = c['idassistente'] || c['idusuario'] || c['id'];
                if (rawId && mapUsuariosID.has(parseInt(rawId))) {
                    usuarioId = parseInt(rawId);
                } else {
                    let rawNome = c['assistente'] || c['usuario'] || c['nome'];
                    if(rawNome) usuarioId = mapUsuariosNome.get(this.normalizar(rawNome));
                }

                if (!usuarioId) {
                    logErros.add(`Linha ${index+2}: Usuário não identificado (${c['assistente'] || 'Sem nome'})`);
                    stats.ignorados++;
                    continue;
                }

                // Identifica Empresa
                let empresaId = parseInt(c['companyid'] || c['company_id'] || c['idempresa'] || 0);
                let nomeEmpresa = c['empresa'] || '';
                
                if (!empresaId) {
                    const match = mapEmpresas.get(this.normalizar(nomeEmpresa));
                    if (match) {
                        empresaId = match.id;
                        nomeEmpresa = match.nome;
                    } else {
                        empresaId = null;
                    }
                }

                // Identifica Data
                const rawDate = c['endtime'] || c['datadaauditoria'] || c['data'] || c['date'];
                const dataObj = this.parseDate(rawDate);
                
                if (!dataObj) {
                    stats.ignorados++;
                    continue;
                }

                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataObj.data,
                    hora: dataObj.hora,
                    empresa: nomeEmpresa,
                    empresa_id: empresaId,
                    nome_documento: String(c['docname'] || c['documento'] || '').substring(0, 255),
                    status: c['status'] || null,
                    observacao: String(c['apontamentosobs'] || c['obs'] || '').substring(0, 500),
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['assert'] || c['assertividade'] || null,
                    auditora: c['auditora'] || null,
                    quantidade: 1,
                    fator: 1
                });
            }

            // --- 4. ENVIO COM BARRA DE PROGRESSO NO BOTÃO ---
            if (inserts.length > 0) {
                const totalLotes = Math.ceil(inserts.length / this.BATCH_SIZE);
                let lotesProcessados = 0;

                const processarLote = async (lote) => {
                    const { error } = await Sistema.supabase.from('producao').insert(lote);
                    if (error) throw error;
                    
                    lotesProcessados++;
                    // CÁLCULO DA PORCENTAGEM
                    const pct = Math.round((lotesProcessados / totalLotes) * 100);
                    atualizarBotao(`Salvando ${pct}%...`);
                };

                // Divide em lotes
                const lotes = [];
                for (let i = 0; i < inserts.length; i += this.BATCH_SIZE) {
                    lotes.push(inserts.slice(i, i + this.BATCH_SIZE));
                }

                // Executa em paralelo controlado
                for (let i = 0; i < lotes.length; i += this.CONCURRENCY_LIMIT) {
                    const chunk = lotes.slice(i, i + this.CONCURRENCY_LIMIT);
                    await Promise.all(chunk.map(l => processarLote(l)));
                }

                stats.sucesso = inserts.length;
                this.showToast(`Sucesso! ${stats.sucesso} registros importados.`, 'success');
                
                if (logErros.size > 0) {
                    this.baixarLog(logErros);
                    this.showToast(`${logErros.size} linhas ignoradas (ver log).`, 'warning');
                }

                // Recarrega a tabela no fundo
                if (Gestao.Assertividade) Gestao.Assertividade.carregar();

            } else {
                this.showToast("Nenhum dado válido encontrado para importar.", 'error');
            }

        } catch (e) {
            console.error(e);
            this.showToast(`Erro: ${e.message}`, 'error');
        } finally {
            // --- 5. RESTAURA O BOTÃO ---
            btn.innerHTML = originalHtml;
            btn.className = originalClass; // Remove classes de desabilitado
            input.value = ""; // Limpa o input para permitir selecionar o mesmo arquivo novamente
        }
    },

    // --- Helpers ---

    parseDate: function(val) {
        if (!val) return null;
        let dateObj = null;
        
        if (typeof val === 'number') {
            // Excel Serial Date
            dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        } else if (typeof val === 'string') {
            const clean = val.trim();
            if (clean.match(/^\d{2}\/\d{2}\/\d{4}/)) {
                const p = clean.split('/');
                dateObj = new Date(p[2], p[1] - 1, p[0]);
            } else {
                dateObj = new Date(clean);
            }
        } else if (val instanceof Date) {
            dateObj = val;
        }

        if (!dateObj || isNaN(dateObj.getTime())) return null;

        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const h = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');

        return { data: `${y}-${m}-${d}`, hora: `${h}:${min}` };
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    },

    normalizarKey: function(k) {
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    },

    baixarLog: function(setErros) {
        const conteudo = `LOG DE IMPORTAÇÃO - ${new Date().toLocaleString()}\n\n${Array.from(setErros).join('\n')}`;
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erros_importacao_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    showToast: function(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if(!container) return alert(msg);

        const el = document.createElement('div');
        const colors = { success: 'bg-emerald-600', error: 'bg-rose-600', warning: 'bg-amber-600', info: 'bg-blue-600' };
        
        el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 animate-fade text-sm font-bold min-w-[300px] mb-2`;
        el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-times' : 'fa-info-circle'}"></i> <span>${msg}</span>`;
        
        container.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }
};